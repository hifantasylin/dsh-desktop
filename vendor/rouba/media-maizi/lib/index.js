import { createRequire } from "node:module";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { ImageProvider, VideoProvider, readActiveMediaProvider } from "@roubaai/media";
//#region lib/types/http.js
/**
* Minimal JSON/binary HTTP helper over the global `fetch` (Node's built-in
* undici). Shared by the Maizi image and video providers for the two endpoints
* they call, with per-request attribution (`User-Agent`) and a small retry
* loop over transient network failures.
*
* No third-party runtime dependency: `fetch` is a Node ≥22 global.
*
* @module @roubaai/media-maizi/http
*/
const { version } = createRequire(import.meta.url)("../package.json");
/** Product identity sent as `User-Agent` (public, non-secret facts only). */
const USER_AGENT = `deepseek-harness/${version} (+https://github.com/deepseek-ai/deepseek-harness)`;
/** Raised for a provider HTTP failure carrying the status and a bounded body snippet. */
var MaiziHttpError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.name = "MaiziHttpError";
		this.status = status;
	}
};
/**
* Raised for a transport-level failure (DNS, connect, TLS, socket reset —
* whatever the runtime surfaces as a bare `TypeError: fetch failed`) AFTER the
* retry loop has been exhausted. The message always carries the stage that
* failed and the underlying cause, so callers and the LLM can tell "the
* provider rejected the request" from "the network dropped before we could
* ask", and can tell "generation failed" from "the result could not be
* downloaded".
*/
var MaiziNetworkError = class extends Error {
	constructor(message, cause) {
		super(message, cause === void 0 ? void 0 : { cause });
		this.name = "MaiziNetworkError";
	}
};
/**
* Human meaning for the Maizi/upstream HTTP status codes the LLM is most
* likely to act on. Kept on one line each so the job detail stays a single
* readable line with the code embedded, e.g. `[402] 余额不足，请充值后再试`.
*/
function httpStatusMeaning(status) {
	switch (status) {
		case 200: return "请求成功";
		case 400: return "模型不可用或未配置价格";
		case 401: return "API Key 无效或缺失";
		case 402: return "余额不足，请充值后再试";
		case 404: return "任务不存在";
		case 422: return "请求参数校验失败";
		case 429: return "请求频率超限或 Coding Plan 额度不足";
		case 500: return "服务器内部错误";
		default: return status === void 0 ? "无状态码（网络层失败）" : `HTTP ${status}`;
	}
}
/** Wrap any non-abort, non-HTTP error thrown by a `fetch` into a {@link MaiziNetworkError}. */
function wrapFetchError(stage, error) {
	if (isAbort(error) || error instanceof MaiziHttpError || error instanceof MaiziNetworkError) return error;
	return new MaiziNetworkError(`${stage} (network): ${error instanceof Error ? error.message : String(error)}`, error);
}
/** Number of attempts for transient network retries (timeouts, 5xx). */
const RETRY_ATTEMPTS = 3;
/** Backoff base in milliseconds between transient retries. */
const RETRY_BASE_MS = 500;
function sleep$1(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal === void 0) {
			setTimeout(resolve, ms);
			return;
		}
		if (signal.aborted) {
			reject(new DOMException("aborted", "AbortError"));
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(new DOMException("aborted", "AbortError"));
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Like {@link sleep}, but its timeout is cancellable: it returns a handle whose
* `clear()` releases the timer and abort listener so a caller that won the
* `Promise.race` does not leave a dangling inactivity timer per chunk.
*/
function cancellableSleep(ms, signal) {
	let timer;
	let onAbort;
	return {
		promise: new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new DOMException("aborted", "AbortError"));
				return;
			}
			onAbort = () => {
				if (timer !== void 0) clearTimeout(timer);
				reject(new DOMException("aborted", "AbortError"));
			};
			timer = setTimeout(() => {
				signal?.removeEventListener("abort", onAbort);
				resolve();
			}, ms);
			signal?.addEventListener("abort", onAbort, { once: true });
		}),
		clear: () => {
			if (timer !== void 0) clearTimeout(timer);
			if (onAbort !== void 0 && signal !== void 0) signal.removeEventListener("abort", onAbort);
		}
	};
}
/** Build the common request headers: JSON content type + attribution. */
function jsonHeaders(apiKey) {
	return {
		"authorization": `Bearer ${apiKey}`,
		"content-type": "application/json",
		"user-agent": USER_AGENT
	};
}
/** True when the error is an abort (the caller's signal fired). */
function isAbort(error) {
	return error?.name === "AbortError";
}
/**
* POST a JSON body and parse the JSON response, retrying transient failures
* (network errors and 5xx) up to {@link RETRY_ATTEMPTS} times. A 4xx returns
* the status without retrying so the provider's own validation errors surface
* immediately.
*/
async function postJson(url, apiKey, body, signal) {
	let lastError;
	for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
		const isLast = attempt === RETRY_ATTEMPTS - 1;
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: jsonHeaders(apiKey),
				body: JSON.stringify(body),
				...signal !== void 0 ? { signal } : {}
			});
			const status = response.status;
			if (status >= 500) {
				lastError = new MaiziHttpError(`Maizi upstream error [${status}]`, status);
				if (!isLast) await sleep$1(RETRY_BASE_MS * 2 ** attempt, signal);
				continue;
			}
			return {
				status,
				data: await readJsonBody(response, status)
			};
		} catch (error) {
			if (isAbort(error)) throw error;
			lastError = wrapFetchError("Maizi request", error);
			if (!isLast) await sleep$1(RETRY_BASE_MS * 2 ** attempt, signal);
		}
	}
	throw lastError instanceof Error ? lastError : new MaiziHttpError("Maizi request failed after retries");
}
/**
* GET a JSON response, retrying transient failures. Used for polling task
* state (`GET /v1/tasks/{id}` and the image v2 202 poll path).
*/
async function getJson(url, apiKey, signal) {
	let lastError;
	for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
		const isLast = attempt === RETRY_ATTEMPTS - 1;
		try {
			const response = await fetch(url, {
				method: "GET",
				headers: jsonHeaders(apiKey),
				...signal !== void 0 ? { signal } : {}
			});
			const status = response.status;
			if (status >= 500) {
				lastError = new MaiziHttpError(`Maizi upstream error [${status}]`, status);
				if (!isLast) await sleep$1(RETRY_BASE_MS * 2 ** attempt, signal);
				continue;
			}
			return {
				status,
				data: await readJsonBody(response, status)
			};
		} catch (error) {
			if (isAbort(error)) throw error;
			lastError = wrapFetchError("Maizi poll", error);
			if (!isLast) await sleep$1(RETRY_BASE_MS * 2 ** attempt, signal);
		}
	}
	throw lastError instanceof Error ? lastError : new MaiziHttpError("Maizi request failed after retries");
}
/**
* Read a response body as JSON, falling back to a bounded raw snippet when the
* body is not valid JSON (a gateway may answer a 4xx with HTML). Returning the
* snippet keeps the failure diagnosable without letting a parse error escape
* into the transient-retry path.
*/
async function readJsonBody(response, status) {
	const text = await response.text();
	if (text.length === 0) return {};
	try {
		return JSON.parse(text);
	} catch {
		const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
		return {
			error: `non-JSON response body [${status}]`,
			snippet
		};
	}
}
/** Default inactivity timeout: 5 minutes without a chunk aborts the download. */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 5 * 6e4;
/**
* Download one response body into raw bytes, streaming chunks (not one-shot
* `arrayBuffer`, so large files like videos survive slow CDN connections) and
* enforcing a per-chunk inactivity timeout plus size bounds.
*/
async function downloadOnce(url, signal, options) {
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: { "user-agent": USER_AGENT },
			...signal !== void 0 ? { signal } : {}
		});
	} catch (error) {
		throw wrapFetchError("download", error);
	}
	if (!response.ok) throw new MaiziHttpError(`download failed [${response.status}]`, response.status);
	if (response.body === null) throw new MaiziHttpError("download: response body is empty (no stream)");
	const contentLength = Number(response.headers.get("content-length"));
	const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : void 0;
	const reader = response.body.getReader();
	const chunks = [];
	let received = 0;
	for (;;) {
		const read = reader.read();
		const timer = cancellableSleep(options.inactivityTimeoutMs, signal);
		if (await Promise.race([read.then(() => "read"), timer.promise.then(() => "timeout")]) === "timeout") throw new MaiziHttpError(`download inactivity timeout after ${options.inactivityTimeoutMs}ms (${received}/${totalBytes ?? "?"} bytes)`);
		timer.clear();
		const { done, value } = await read;
		if (done) break;
		const chunk = value;
		chunks.push(chunk);
		received += chunk.byteLength;
		options.onProgress?.(received, totalBytes);
		if (options.maxBytes !== void 0 && received > options.maxBytes) throw new MaiziHttpError(`download exceeds ${options.maxBytes} bytes`);
	}
	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	if (options.minBytes !== void 0 && bytes.byteLength < options.minBytes) throw new MaiziHttpError(`download truncated: expected ≥ ${options.minBytes} bytes, got ${bytes.byteLength}`);
	return bytes;
}
/**
* Download a URL into raw bytes (the 24h-valid result file), streaming the
* body and verifying size bounds, with transient-failure retry. The caller
* owns `maxBytes`; providers pass `minBytes` (e.g. a video floor) and an
* inactivity timeout so a truncated download is retried rather than landed as
* a corrupt file.
*/
async function downloadBytes(url, signal, options) {
	const resolved = {
		maxBytes: options?.maxBytes,
		minBytes: options?.minBytes,
		inactivityTimeoutMs: options?.inactivityTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
		...options?.onProgress === void 0 ? {} : { onProgress: options.onProgress }
	};
	let lastError;
	for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) try {
		return await downloadOnce(url, signal, resolved);
	} catch (error) {
		if (isAbort(error)) throw error;
		lastError = error;
		if (attempt < RETRY_ATTEMPTS - 1) await sleep$1(RETRY_BASE_MS * 2 ** attempt, signal);
	}
	throw lastError instanceof Error ? lastError : new MaiziHttpError("download failed after retries");
}
/**
* Open a streaming read of a URL and return its body as a `ReadableStream` of
* byte chunks — the passthrough seam for the host media proxy. Unlike
* {@link downloadBytes}, the bytes are NOT accumulated: the returned stream is
* handed straight to a `Response`, so the CDN's own stream (and, when the CDN
* supports `Accept-Ranges`, its range responses) reaches the consumer
* incrementally — enabling progressive image display and video "play while
* downloading". A non-2xx upstream answers `undefined` so the caller can map
* the failure (e.g. an expired 24h URL → 410) rather than treat it as bytes.
*
* @param url - the 24h-valid result URL to stream.
* @param signal - cancellation forwarded to the upstream `fetch`; aborts the
* returned stream.
* @param options - optional byte-range passthrough.
* @returns the upstream body stream, or `undefined` when the upstream fetch
* fails before the body is produced (caller inspects status/headers).
*/
async function streamBytes(url, signal, options) {
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				"user-agent": USER_AGENT,
				...options?.range !== void 0 ? { range: options.range } : {}
			},
			...signal !== void 0 ? { signal } : {}
		});
	} catch (error) {
		throw wrapFetchError("stream", error);
	}
	if (response.body === null) return;
	return {
		stream: response.body,
		status: response.status,
		headers: response.headers
	};
}
//#endregion
//#region lib/types/settings-config.js
/**
* The settings namespace the roubaai video plugin's Settings page owns. The
* actual per-operation read of the active provider (key, endpoint, model) now
* lives in `@roubaai/media`'s `readActiveMediaProvider`, which both this
* package and `@roubaai/media-mxapi` consume.
* @module @roubaai/media-maizi/settings-config
*/
/** Namespace the roubaai video plugin's Settings page owns. */
const DEFAULT_SETTINGS_NAMESPACE = "roubaai-video-plugin";
/** Poll interval for the 202 → poll path (Maizi docs suggest 5-10s). */
const IMAGE_POLL_INTERVAL_MS = 5e3;
/** Max reference images (Maizi hard cap). */
const MAX_REF_IMAGES = 9;
/**
* USD per image, keyed `model/resolution`. A matching `any` entry covers a
* model Maizi prices flat across resolution tiers.
*/
const IMAGE_COST_USD = {
	"gpt-image-2/1k": .009,
	"gpt-image-2/2k": .029,
	"gpt-image-2/4k": .044,
	"nano-banana-fast/1k": .009,
	"nano-banana-2/any": .018
};
/** Upper bound on a downloaded image result (Maizi results are a few MB). */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/**
* Sniff the image media type from its magic bytes, defaulting to PNG for an
* unrecognized payload. Used instead of hard-coding `image/png` so a JPEG/GIF/
* WebP result is persisted with its real type.
*/
function sniffImageMediaType(bytes) {
	if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
	if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
	if (bytes.length >= 6 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) return "image/png";
	if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) return "image/webp";
	return "image/png";
}
/** Raised when the 202 poll exceeds the foreground timeout; carries `taskId`. */
var ImagePollTimeoutError = class extends Error {
	code = "IMAGE_POLL_TIMEOUT";
	taskId;
	constructor(taskId) {
		super(`image generation timed out before completion (task ${taskId}); retry or poll the task later`);
		this.name = "ImagePollTimeoutError";
		this.taskId = taskId;
	}
};
/** Raised when the credential resolve returns `undefined` (distinct from NO_PROVIDER). */
var MissingCredentialError = class extends Error {
	code = "MISSING_CREDENTIAL";
	constructor(ref) {
		super(`no API key resolved for "${ref}"; store it through the credentials service or export it in the environment`);
		this.name = "MissingCredentialError";
	}
};
/**
* Decode a base64 payload into bytes. Accepts a bare base64 string or a
* `data:image/...;base64,...` data URI.
*/
function decodeBase64(payload) {
	const comma = payload.indexOf(",");
	const raw = comma >= 0 && payload.startsWith("data:") ? payload.slice(comma + 1) : payload;
	return new Uint8Array(Buffer.from(raw, "base64"));
}
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal === void 0) {
			setTimeout(resolve, ms);
			return;
		}
		if (signal.aborted) {
			reject(/* @__PURE__ */ new Error("aborted"));
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(/* @__PURE__ */ new Error("aborted"));
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Maizi image provider (v2 sync + 202 poll fallback). Lands images through
* `ctx.attachments.saveImage`; never returns raw base64.
*/
var MaiziImageProvider = class extends ImageProvider {
	ctx;
	provider = "maizi";
	defaultModel;
	baseUrl;
	apiKeyEnv;
	pollTimeoutMs;
	settingsNamespace;
	constructor(ctx, config = {}) {
		super();
		this.ctx = ctx;
		this.baseUrl = config.baseUrl ?? "https://www.maizitech.xyz/v1";
		this.defaultModel = config.model ?? "gpt-image-2";
		this.apiKeyEnv = config.apiKeyEnv ?? "MAIZI_API_KEY";
		this.pollTimeoutMs = config.pollTimeoutMs ?? 36e4;
		this.settingsNamespace = config.settingsNamespace ?? "roubaai-video-plugin";
	}
	/**
	* Resolve the API key per operation. The Settings page's active provider
	* wins over the credential store: it is the deployment's explicit
	* per-install choice, and the one surface a person can edit without touching
	* the environment. The credential store — and through it `MAIZI_API_KEY` —
	* stays the fallback, so a deployment that never opens the Settings page is
	* unaffected.
	* @throws {MissingCredentialError} when neither source holds a key.
	*/
	async resolveKey() {
		const configured = readActiveMediaProvider(this.ctx, this.settingsNamespace, "image").apiKey;
		if (configured !== void 0) return configured;
		const credentials = this.ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(credentialRef(this.apiKeyEnv));
			if (hit !== void 0 && hit.value.length > 0) return hit.value;
		}
		throw new MissingCredentialError(this.apiKeyEnv);
	}
	/**
	* Endpoint base: the Settings page's active-provider override when one is
	* stored, else the deployment-configured base. A trailing slash is trimmed
	* so a pasted URL cannot produce a `//` path segment.
	*/
	resolveBaseUrl() {
		return (readActiveMediaProvider(this.ctx, this.settingsNamespace, "image").baseUrl ?? this.baseUrl).replace(/\/+$/, "");
	}
	/**
	* Default image model: the Settings page's active-provider override when one
	* is stored, else the deployment-configured model. `ImageGenerateInput`
	* carries no model field, so this value is the only thing that decides which
	* model runs — which is exactly why it has to be re-read per operation.
	*/
	resolveModel() {
		return readActiveMediaProvider(this.ctx, this.settingsNamespace, "image").model ?? this.defaultModel;
	}
	async generate(input, signal, onProgress) {
		const apiKey = await this.resolveKey();
		const model = this.resolveModel();
		const payload = {
			model,
			prompt: input.prompt,
			response_format: "b64_json",
			n: 1
		};
		if (input.refImages !== void 0 && input.refImages.length > 0) payload["images"] = input.refImages.slice(0, MAX_REF_IMAGES);
		if (input.width !== void 0 && input.height !== void 0) payload["size"] = `${input.width}x${input.height}`;
		else if (input.aspectRatio !== void 0) payload["size"] = input.aspectRatio;
		else payload["size"] = "1:1";
		payload["image_size"] = input.resolution ?? "1K";
		payload["quality"] = input.quality ?? "low";
		const { status, data } = await postJson(`${this.resolveBaseUrl()}/images/generations`, apiKey, payload, signal);
		if (status !== 200 && status !== 202) throw new MaiziHttpError(`Maizi image generation failed [${status}]`, status);
		const response = data;
		const taskId = response.data?.[0]?.task_id ?? response.task_id ?? response.id;
		if (taskId === void 0) throw new MaiziHttpError("Maizi returned no task id for image generation", status);
		const { url, bytes } = await this.pollTask(taskId, apiKey, signal, onProgress);
		if (bytes === void 0) {
			if (url === void 0) throw new MaiziHttpError(`Maizi task ${taskId} completed with no result`, 200);
			return this.urlRef(url, model);
		}
		try {
			return await this.land(bytes, model, url);
		} catch {
			if (url === void 0) throw new MaiziHttpError(`Maizi task ${taskId} result could not be saved`, 200);
			return this.urlRef(url, model);
		}
	}
	/**
	* Degrade a generated-but-not-landed image to a URL-only reference. The
	* model is passed in (not re-resolved) so the reported `providerMeta` names
	* the model this generation actually used.
	*/
	urlRef(url, model) {
		return {
			kind: "image",
			mediaType: "image/png",
			mediaRef: {
				url,
				mediaType: "image/png",
				expiresAt: Date.now() + 1440 * 60 * 1e3
			},
			providerMeta: {
				provider: this.provider,
				model
			}
		};
	}
	/**
	* Poll a 202-submitted task until `completed`/`failed`/`violation`, under the
	* foreground timeout ceiling. On timeout, throws {@link ImagePollTimeoutError}
	* carrying the task id (so the model may retry or query later), rather than
	* blocking the foreground indefinitely.
	*/
	async pollTask(taskId, apiKey, signal, onProgress) {
		const deadline = Date.now() + this.pollTimeoutMs;
		for (;;) {
			if (Date.now() >= deadline) throw new ImagePollTimeoutError(taskId);
			await sleep(IMAGE_POLL_INTERVAL_MS, signal);
			const { status, data } = await getJson(`${this.resolveBaseUrl()}/tasks/${taskId}`, apiKey, signal);
			if (status !== 200) continue;
			const task = data;
			const taskStatus = task.status;
			if (taskStatus === "completed") {
				const firstUrl = (task.result_urls ?? [])[0];
				if (firstUrl !== void 0) try {
					return {
						url: firstUrl,
						bytes: await this.downloadResult(firstUrl, signal, onProgress)
					};
				} catch {
					return { url: firstUrl };
				}
				const inline = task.data?.[0];
				if (inline?.b64_json !== void 0) return { bytes: decodeBase64(inline.b64_json) };
				if (inline?.url !== void 0) try {
					const bytes = await this.downloadResult(inline.url, signal, onProgress);
					return {
						url: inline.url,
						bytes
					};
				} catch {
					return { url: inline.url };
				}
				throw new MaiziHttpError(`Maizi task ${taskId} completed with no result`, 200);
			}
			if (taskStatus === "failed" || taskStatus === "violation") throw new MaiziHttpError(`Maizi task ${taskId} ${taskStatus}: ${task.error_msg ?? "no error message"}`);
		}
	}
	/** Download a completed result URL, reporting download progress. */
	async downloadResult(url, signal, onProgress) {
		onProgress?.({
			phase: "downloading",
			percent: 0
		});
		const bytes = await downloadBytes(url, signal, {
			maxBytes: MAX_IMAGE_BYTES,
			onProgress: (received, total) => {
				onProgress?.({
					phase: "downloading",
					percent: total !== void 0 && total > 0 ? Math.round(received / total * 100) : 0
				});
			}
		});
		onProgress?.({
			phase: "saving",
			percent: 100
		});
		return bytes;
	}
	/** Persist image bytes and return the unified result reference. */
	async land(bytes, model, resultUrl) {
		const attachments = this.ctx.get("attachments");
		if (attachments === void 0) throw new Error("media-maizi: ctx.attachments is missing; cannot persist the generated image");
		const mediaType = sniffImageMediaType(bytes);
		const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/webp" ? "webp" : "png";
		const ref = await attachments.saveImage({
			data: bytes,
			mediaType,
			name: `generated.${extension}`
		});
		return {
			kind: "image",
			attachmentRef: ref.attachmentId,
			attachment: ref,
			mediaType,
			...resultUrl !== void 0 ? { resultUrl } : {},
			providerMeta: {
				provider: this.provider,
				model
			}
		};
	}
	/** Reference images Maizi accepts on one image request. */
	caps() {
		return { maxRefImages: MAX_REF_IMAGES };
	}
	/**
	* Maizi's image rates, in USD per image, keyed `model/resolution`. A matching
	* `any` entry covers a model Maizi prices flat across tiers; a model absent
	* from both is unpriced and returns `undefined`.
	*/
	estimateCostUsd(model, resolution) {
		return IMAGE_COST_USD[`${model}/${resolution.toLowerCase()}`] ?? IMAGE_COST_USD[`${model}/any`];
	}
	/**
	* Probe the endpoint and key the configuration form holds. A read-only task
	* lookup: an unknown id answers a business 404, which proves reachability and
	* key acceptance without submitting a billable generation.
	*/
	async probe(draft) {
		if (draft.apiKey.trim() === "") return {
			ok: false,
			message: "未填写 API Key"
		};
		const base = draft.baseUrl.trim().replace(/\/+$/, "");
		if (base === "") return {
			ok: false,
			message: "未填写接口地址"
		};
		try {
			const { status } = await getJson(`${base}/tasks/nonexistent-probe-connection`, draft.apiKey);
			if (status < 500 && status !== 401 && status !== 403) return {
				ok: true,
				message: `连接成功（HTTP ${status}）`
			};
			return {
				ok: false,
				message: status === 401 || status === 403 ? `API Key 被拒绝（HTTP ${status}）` : `端点返回 HTTP ${status}`
			};
		} catch (error) {
			return {
				ok: false,
				message: `无法连接端点：${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	async testConnection() {
		try {
			const apiKey = await this.resolveKey();
			const { status } = await getJson(`${this.resolveBaseUrl()}/tasks/nonexistent-probe-connection`, apiKey);
			return status < 500 && status !== 401 && status !== 403;
		} catch {
			return false;
		}
	}
};
/**
* Conservative media URL expiry: Maizi returns no precise expiry field, so the
* 24h download policy is fixed here and stamped onto the produced `MediaRef`
* as `expiresAt = now + 24h`.
*/
const MEDIA_URL_TTL_MS = 1440 * 6e4;
/** Bound on the result-URL probe in `finalize` (a hung CDN must not block forever). */
const VIDEO_PROBE_TIMEOUT_MS = 3e4;
/** Seedance 2.0 系上限（doubao-seedance-2.0 / -mini / -fast）。 */
const CAPS_2_0 = {
	minDuration: 4,
	maxDuration: 15,
	maxImageUrls: 9,
	maxVideoUrls: 3,
	maxAudioUrls: 3
};
/** Seedance 2.5 系上限（doubao-seedance-2.5）。 */
const CAPS_2_5 = {
	minDuration: 4,
	maxDuration: 30,
	maxImageUrls: 30,
	maxVideoUrls: 10,
	maxAudioUrls: 10
};
/** 判定模型代际：2.5 系用 2.5 上限，其余（2.0 系/未知）用 2.0 上限保守处理。 */
function capsForModel(model) {
	return model.includes("2.5") ? CAPS_2_5 : CAPS_2_0;
}
/**
* USD per second, keyed `model/resolution`: Maizi's published Seedance rates.
* A model or tier absent here is unpriced, and the ledger then records the run
* without an estimate rather than with a wrong one.
*/
const VIDEO_COST_USD_PER_SECOND = {
	"doubao-seedance-2.0-fast/480p": .0637,
	"doubao-seedance-2.0-fast/720p": .137,
	"doubao-seedance-2.0/480p": .0792,
	"doubao-seedance-2.0/720p": .1704,
	"doubao-seedance-2.0/1080p": .4253,
	"doubao-seedance-2.5/480p": .1201,
	"doubao-seedance-2.5/720p": .27
};
/**
* Maizi's native statuses mapped to the normalized poll status. `queued`/
* `pending`/`processing` all mean "still running"; `completed` is the only
* success; `failed` and `violation` both fail (with `violation` carrying its
* content-safety reason as the error message).
*/
function normalizeStatus(status) {
	switch (status) {
		case "completed": return "succeeded";
		case "failed":
		case "violation": return "failed";
		default: return "running";
	}
}
/**
* An internal pollable handle caching the latest Maizi task payload so
* `finalize` can download the just-succeeded `result_urls[0]` (24h-valid) and
* record the provider-reported `costUsd`.
*/
var MaiziVideoTaskHandle = class {
	baseUrl;
	resolveKey;
	taskId;
	lastResultUrls = [];
	lastCostUsd;
	constructor(taskId, baseUrl, resolveKey) {
		this.baseUrl = baseUrl;
		this.resolveKey = resolveKey;
		this.taskId = taskId;
	}
	async poll(signal) {
		let response;
		try {
			response = await getJson(`${this.baseUrl}/tasks/${this.taskId}`, await this.resolveKey(), signal);
		} catch (error) {
			throw error instanceof MaiziNetworkError ? new MaiziNetworkError(`video task ${this.taskId} poll ${error.message}`, error) : error;
		}
		const { status, data } = response;
		if (status !== 200) {
			if (status >= 400 && status < 500 && status !== 429) return {
				status: "failed",
				errorMsg: `${httpStatusMeaning(status)}（HTTP ${status}）`
			};
			return { status: "running" };
		}
		const task = data;
		this.lastResultUrls = task.result_urls ?? [];
		if (task.cost !== void 0) this.lastCostUsd = task.cost;
		const normalized = normalizeStatus(task.status);
		if (normalized === "succeeded") {
			const resultUrl = this.lastResultUrls[0];
			if (resultUrl === void 0) return {
				status: "failed",
				errorMsg: `Maizi task ${this.taskId} completed with no result URL`
			};
			return {
				status: "succeeded",
				progress: 100,
				resultUrl
			};
		}
		if (normalized === "failed") return {
			status: "failed",
			errorMsg: task.error_msg ?? `Maizi task ${this.taskId} failed (${task.status ?? "unknown"})`
		};
		return {
			status: "running",
			...task.progress !== void 0 ? { progress: task.progress } : {}
		};
	}
	/** The cached cost (USD) reported by the provider, if any. */
	get costUsd() {
		return this.lastCostUsd;
	}
};
/**
* Maizi video provider (v1 async submit + poll + finalize). The final video is
* downloaded on `finalize` and landed to a local file; the 24h-valid URL is
* never returned bare.
*/
var MaiziVideoProvider = class extends VideoProvider {
	ctx;
	provider = "maizi";
	defaultModel;
	baseUrl;
	apiKeyEnv;
	settingsNamespace;
	constructor(ctx, config = {}) {
		super();
		this.ctx = ctx;
		this.baseUrl = config.baseUrl ?? "https://www.maizitech.xyz/v1";
		this.defaultModel = config.model ?? "doubao-seedance-2.0-mini";
		this.apiKeyEnv = config.apiKeyEnv ?? "MAIZI_API_KEY";
		this.settingsNamespace = config.settingsNamespace ?? "roubaai-video-plugin";
	}
	/**
	* Resolve the API key per operation. The Settings page wins over the
	* credential store: it is the deployment's explicit per-install choice, and
	* the one surface a person can edit without touching the environment. The
	* credential store — and through it `MAIZI_API_KEY` — stays the fallback, so
	* a deployment that never opens the Settings page is unaffected.
	* @throws {MissingCredentialError} when neither source holds a key.
	*/
	async resolveKey() {
		const configured = readActiveMediaProvider(this.ctx, this.settingsNamespace, "video").apiKey;
		if (configured !== void 0) return configured;
		const credentials = this.ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(credentialRef(this.apiKeyEnv));
			if (hit !== void 0 && hit.value.length > 0) return hit.value;
		}
		throw new MissingCredentialError(this.apiKeyEnv);
	}
	/**
	* Endpoint base: the Settings page's override when one is stored, else the
	* deployment-configured base. A trailing slash is trimmed so a pasted URL
	* cannot produce a `//` path segment.
	*/
	resolveBaseUrl() {
		return (readActiveMediaProvider(this.ctx, this.settingsNamespace, "video").baseUrl ?? this.baseUrl).replace(/\/+$/, "");
	}
	/**
	* Default video model: the Settings page's override when one is stored, else
	* the deployment-configured model. A caller's explicit `input.model` still
	* wins — this is only the default the request falls back to.
	*/
	resolveModel() {
		return readActiveMediaProvider(this.ctx, this.settingsNamespace, "video").model ?? this.defaultModel;
	}
	async submit(input, signal) {
		const apiKey = await this.resolveKey();
		const model = input.model ?? this.resolveModel();
		const caps = capsForModel(model);
		const payload = {
			model,
			prompt: input.prompt,
			duration: input.duration ?? 5
		};
		if (input.imageUrls !== void 0 && input.imageUrls.length > 0) payload["image_urls"] = input.imageUrls.slice(0, caps.maxImageUrls);
		if (input.imageWithRoles !== void 0 && input.imageWithRoles.length > 0) payload["image_with_roles"] = input.imageWithRoles;
		if (input.videoUrls !== void 0 && input.videoUrls.length > 0) payload["video_urls"] = input.videoUrls.slice(0, caps.maxVideoUrls);
		if (input.audioUrls !== void 0 && input.audioUrls.length > 0) payload["audio_urls"] = input.audioUrls.slice(0, caps.maxAudioUrls);
		if (input.size !== void 0) payload["size"] = input.size;
		if (input.resolution !== void 0) payload["resolution"] = input.resolution;
		if (input.generateAudio !== void 0) payload["generate_audio"] = input.generateAudio;
		if (input.returnLastFrame !== void 0) payload["return_last_frame"] = input.returnLastFrame;
		if (input.generationType !== void 0) payload["generation_type"] = input.generationType;
		if (input.outputFormat !== void 0) payload["output_format"] = input.outputFormat;
		if (input.callbackUrl !== void 0) payload["callback_url"] = input.callbackUrl;
		if (input.watermark !== void 0) payload["watermark"] = input.watermark;
		if (input.seed !== void 0) payload["seed"] = input.seed;
		let response;
		try {
			response = await postJson(`${this.resolveBaseUrl()}/videos/generations`, apiKey, payload, signal);
		} catch (error) {
			throw error instanceof MaiziNetworkError ? new MaiziNetworkError(`video submission ${error.message}`, error) : error;
		}
		const { status, data } = response;
		if (status !== 200) throw new MaiziHttpError(`Maizi video submission failed [${status}]`, status);
		const taskId = data.id;
		if (taskId === void 0) throw new MaiziHttpError("Maizi video submission returned no task id", 200);
		return new MaiziVideoTaskHandle(taskId, this.resolveBaseUrl(), () => this.resolveKey());
	}
	async finalize(handle, signal, onProgress) {
		const url = (await handle.poll(signal)).resultUrl;
		if (url === void 0) throw new MaiziHttpError(`video task ${handle.taskId} has no result URL to download`);
		onProgress?.({
			phase: "downloading",
			percent: 0
		});
		let probe;
		try {
			probe = await streamBytes(url, signal !== void 0 ? AbortSignal.any([signal, AbortSignal.timeout(VIDEO_PROBE_TIMEOUT_MS)]) : AbortSignal.timeout(VIDEO_PROBE_TIMEOUT_MS));
		} catch (error) {
			throw error instanceof MaiziNetworkError ? new MaiziNetworkError(`video task ${handle.taskId} result download ${error.message}`, error) : error;
		}
		if (probe === void 0 || probe.status < 200 || probe.status >= 300) {
			await probe?.stream.cancel().catch(() => {});
			throw new MaiziHttpError(`video task ${handle.taskId} result URL is unreachable [${probe?.status ?? "no-body"}]`, probe?.status);
		}
		await probe.stream.cancel();
		const contentLength = Number(probe.headers.get("content-length"));
		const sizeBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : void 0;
		onProgress?.({
			phase: "saving",
			percent: 100
		});
		const costUsd = handle instanceof MaiziVideoTaskHandle ? handle.costUsd : void 0;
		return {
			kind: "video",
			mediaType: "video/mp4",
			mediaRef: {
				url,
				mediaType: "video/mp4",
				...sizeBytes !== void 0 ? { sizeBytes } : {},
				expiresAt: Date.now() + MEDIA_URL_TTL_MS
			},
			providerMeta: {
				provider: this.provider,
				model: this.defaultModel,
				taskId: handle.taskId,
				...costUsd !== void 0 ? { costUsd } : {}
			}
		};
	}
	/**
	* Bounds for the model being asked for. An omitted model resolves to the one
	* this provider would use anyway, so a caller that never names a model still
	* validates against the right generation.
	*/
	caps(model) {
		return capsForModel(model ?? this.resolveModel());
	}
	/**
	* Maizi's Seedance rates, in USD per second. A tier Maizi does not price
	* returns `undefined`; the tool then records the run without an estimate.
	*/
	estimateCostUsd(model, durationSeconds, resolution) {
		const perSecond = VIDEO_COST_USD_PER_SECOND[`${model}/${resolution}`];
		return perSecond === void 0 ? void 0 : perSecond * durationSeconds;
	}
	/**
	* Probe the endpoint and key the configuration form holds. A read-only task
	* lookup: an unknown id answers a business 404, which proves reachability and
	* key acceptance without creating a task.
	*/
	async probe(draft) {
		if (draft.apiKey.trim() === "") return {
			ok: false,
			message: "未填写 API Key"
		};
		const base = draft.baseUrl.trim().replace(/\/+$/, "");
		if (base === "") return {
			ok: false,
			message: "未填写接口地址"
		};
		try {
			const { status } = await getJson(`${base}/tasks/nonexistent-probe-connection`, draft.apiKey);
			if (status < 500 && status !== 401 && status !== 403) return {
				ok: true,
				message: `连接成功（HTTP ${status}）`
			};
			return {
				ok: false,
				message: status === 401 || status === 403 ? `API Key 被拒绝（HTTP ${status}）` : `端点返回 HTTP ${status}`
			};
		} catch (error) {
			return {
				ok: false,
				message: `无法连接端点：${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	async testConnection() {
		try {
			const apiKey = await this.resolveKey();
			const { status } = await getJson(`${this.resolveBaseUrl()}/tasks/nonexistent-probe-connection`, apiKey);
			return status < 500 && status !== 401 && status !== 403;
		} catch {
			return false;
		}
	}
};
//#endregion
//#region lib/types/index.js
/**
* MaiziAI media provider plugin: registers the image and video providers with
* `ctx.media`. Registering a provider is all that is needed to wire it to the
* `generate_image`/`generate_video` tools (which stay provider-agnostic).
*
* @module @roubaai/media-maizi
*/
const name = "roubaai-media-maizi";
const inject = [
	"media",
	"credentials",
	"attachments"
];
function apply(ctx, config = {}) {
	const disposeImage = ctx.media.registerImageProvider(new MaiziImageProvider(ctx, {
		...config.baseUrl !== void 0 ? { baseUrl: config.baseUrl } : {},
		...config.imageModel !== void 0 ? { model: config.imageModel } : {},
		...config.apiKeyEnv !== void 0 ? { apiKeyEnv: config.apiKeyEnv } : {},
		...config.pollTimeoutMs !== void 0 ? { pollTimeoutMs: config.pollTimeoutMs } : {},
		...config.settingsNamespace !== void 0 ? { settingsNamespace: config.settingsNamespace } : {}
	}));
	const disposeVideo = ctx.media.registerVideoProvider(new MaiziVideoProvider(ctx, {
		...config.baseUrl !== void 0 ? { baseUrl: config.baseUrl } : {},
		...config.videoModel !== void 0 ? { model: config.videoModel } : {},
		...config.apiKeyEnv !== void 0 ? { apiKeyEnv: config.apiKeyEnv } : {},
		...config.settingsNamespace !== void 0 ? { settingsNamespace: config.settingsNamespace } : {}
	}));
	return () => {
		disposeImage();
		disposeVideo();
	};
}
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { DEFAULT_SETTINGS_NAMESPACE, ImagePollTimeoutError, MaiziImageProvider, MaiziVideoProvider, MissingCredentialError, apply, types_default as default, inject, name };
