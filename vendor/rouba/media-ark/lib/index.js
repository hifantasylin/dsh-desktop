import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { VideoProvider, readActiveMediaProvider } from "@roubaai/media";
//#region lib/types/http.js
/**
* Minimal JSON and result-probe HTTP helper for the Ark adapter, over the
* global `fetch` (Node's undici). Only the calls this provider makes: create a
* generation task, poll it, and confirm the produced file is reachable.
*
* No third-party runtime dependency: `fetch` is a Node >= 22 global.
* @module @roubaai/media-ark/http
*/
/** Product identity sent as `User-Agent` (public, non-secret facts only). */
const USER_AGENT = "roubaai-media-ark (+https://github.com/hifantasylin/roubaai-media)";
/** Raised for an Ark HTTP failure carrying the status and a bounded body snippet. */
var ArkHttpError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.name = "ArkHttpError";
		this.status = status;
	}
};
/**
* Raised for a transport-level failure (DNS, connect, TLS, socket reset) after
* the retry loop is exhausted. The message always names the stage that failed,
* so a caller can tell "the provider rejected the request" from "the network
* dropped before we could ask".
*/
var ArkNetworkError = class extends Error {
	constructor(message, cause) {
		super(message, cause === void 0 ? void 0 : { cause });
		this.name = "ArkNetworkError";
	}
};
/** Whether an error is a transport-level failure rather than an HTTP answer. */
function isNetworkError(error) {
	return error instanceof ArkNetworkError;
}
/**
* Human meaning for the Ark status codes a caller is most likely to act on.
* Kept to one line each so a job detail stays a single readable line.
* @param status - the HTTP status, when one was received.
* @returns the meaning, or a generic rendering.
*/
function arkStatusMeaning(status) {
	switch (status) {
		case 400: return "请求参数或模型 ID 无效";
		case 401: return "API Key 无效或缺失";
		case 403: return "API Key 无权访问该模型";
		case 404: return "任务不存在";
		case 429: return "请求频率超限或额度不足";
		case 500: return "方舟服务内部错误";
		default: return status === void 0 ? "无状态码（网络层失败）" : `HTTP ${status}`;
	}
}
/** Number of attempts for transient network retries (timeouts, 5xx). */
const RETRY_ATTEMPTS = 3;
/** Backoff base in milliseconds between transient retries. */
const RETRY_BASE_MS = 500;
/** Request headers: JSON content type plus the Ark bearer credential. */
function arkHeaders(apiKey) {
	return {
		"authorization": `Bearer ${apiKey}`,
		"content-type": "application/json",
		"user-agent": USER_AGENT
	};
}
/** True when the error is the caller's abort rather than a request failure. */
function isAbort(error) {
	return error?.name === "AbortError";
}
/** Wrap any non-abort, non-HTTP `fetch` failure into an {@link ArkNetworkError}. */
function wrapFetchError(stage, error) {
	if (isAbort(error) || error instanceof ArkHttpError || error instanceof ArkNetworkError) return error;
	return new ArkNetworkError(`${stage} (network): ${error instanceof Error ? error.message : String(error)}`, error);
}
function sleep(ms, signal) {
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
* Read a response body as JSON, falling back to a bounded raw snippet when the
* body is not JSON (a gateway may answer a 4xx with HTML). Returning the
* snippet keeps a failure diagnosable without turning a parse error into a
* transient retry.
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
/**
* POST a JSON body and parse the JSON response, retrying transient failures
* (network errors and 5xx). A 4xx returns the status without retrying so Ark's
* own validation errors surface immediately.
* @param url - the absolute endpoint.
* @param apiKey - the Ark API key to present.
* @param body - the JSON-serializable request body.
* @param signal - cancellation forwarded to `fetch`.
* @returns the status and parsed body.
*/
async function postJson(url, apiKey, body, signal) {
	let lastError;
	for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
		const isLast = attempt === RETRY_ATTEMPTS - 1;
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: arkHeaders(apiKey),
				body: JSON.stringify(body),
				...signal !== void 0 ? { signal } : {}
			});
			const status = response.status;
			if (status >= 500) {
				lastError = new ArkHttpError(`Ark upstream error [${status}]`, status);
				if (!isLast) await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
				continue;
			}
			return {
				status,
				data: await readJsonBody(response, status)
			};
		} catch (error) {
			if (isAbort(error)) throw error;
			lastError = wrapFetchError("Ark request", error);
			if (!isLast) await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
		}
	}
	throw lastError instanceof Error ? lastError : new ArkHttpError("Ark request failed after retries");
}
/**
* GET a JSON response, retrying transient failures. Used to poll task state.
* @param url - the absolute endpoint.
* @param apiKey - the Ark API key to present.
* @param signal - cancellation forwarded to `fetch`.
* @returns the status and parsed body.
*/
async function getJson(url, apiKey, signal) {
	let lastError;
	for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
		const isLast = attempt === RETRY_ATTEMPTS - 1;
		try {
			const response = await fetch(url, {
				method: "GET",
				headers: arkHeaders(apiKey),
				...signal !== void 0 ? { signal } : {}
			});
			const status = response.status;
			if (status >= 500) {
				lastError = new ArkHttpError(`Ark upstream error [${status}]`, status);
				if (!isLast) await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
				continue;
			}
			return {
				status,
				data: await readJsonBody(response, status)
			};
		} catch (error) {
			if (isAbort(error)) throw error;
			lastError = wrapFetchError("Ark poll", error);
			if (!isLast) await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
		}
	}
	throw lastError instanceof Error ? lastError : new ArkHttpError("Ark request failed after retries");
}
/**
* Confirm a produced file is reachable and read its stated size, then cancel
* the body: the bytes themselves flow through the host's media proxy when the
* user plays or downloads the asset, so holding them here would only buffer a
* whole video for a `content-length` header.
* @param url - the result URL to probe.
* @param signal - cancellation forwarded to `fetch`.
* @returns the probe outcome, or `undefined` when the upstream produced no body.
*/
async function probeResult(url, signal) {
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: { "user-agent": USER_AGENT },
			...signal !== void 0 ? { signal } : {}
		});
	} catch (error) {
		throw wrapFetchError("result probe", error);
	}
	if (response.body === null) return { status: response.status };
	await response.body.cancel().catch(() => {});
	const contentLength = Number(response.headers.get("content-length"));
	const sizeBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : void 0;
	return {
		status: response.status,
		...sizeBytes === void 0 ? {} : { sizeBytes }
	};
}
//#endregion
//#region lib/types/settings-config.js
/**
* The settings namespace the roubaai Settings page owns. The per-operation read
* of the active provider (key, endpoint, model) lives in `@roubaai/media`'s
* `readActiveMediaProvider`, which every backend package consumes.
* @module @roubaai/media-ark/settings-config
*/
/** Namespace the roubaai video plugin's Settings page owns. */
const DEFAULT_SETTINGS_NAMESPACE = "roubaai-video-plugin";
//#endregion
//#region lib/types/ark-video-provider.js
/**
* Volcengine Ark video provider — the vendor's own asynchronous task API
* (`POST {base}/contents/generations/tasks`, polled through
* `GET {base}/contents/generations/tasks/{id}`).
*
* This adapter calls Ark directly with a deployment's own `ARK_API_KEY`. Ark's
* request body is a multimodal `content` array rather than a flat prompt plus
* image list, so the mapping from the seam's provider-neutral input lives here:
* reference images, videos, and audio each become one typed entry, and the
* caller's explicit role intent (`first_frame` / `last_frame` /
* `reference_image`) passes through unchanged.
*
* Ark prices in RMB per second with vendor-specific discounts and tiers, so
* this adapter reports no USD estimate. The ledger then records the run without
* a figure rather than converting at a rate this package does not own.
* @module @roubaai/media-ark/ark-video-provider
*/
/** Ark's public API base (cn-beijing region). */
const ARK_VIDEO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
/** Credential reference for the Ark API key. */
const ARK_API_KEY_REF = "ARK_API_KEY";
/**
* Fallback model. Callers name a model on every request, so this only backs
* `caps()` and the connectivity probe; it is Ark's Seedance 1.5 pro id.
*/
const DEFAULT_VIDEO_MODEL = "doubao-seedance-1-5-pro-251215";
/**
* Conservative result-URL lifetime. Ark states no expiry for the produced file,
* so the 24h download policy the other adapters use is applied here too.
*/
const MEDIA_URL_TTL_MS = 1440 * 6e4;
/** Bound on the result-URL probe in `finalize` (a hung CDN must not block forever). */
const VIDEO_PROBE_TIMEOUT_MS = 3e4;
/**
* Per-generation bounds. Ark's model ids embed the generation
* (`doubao-seedance-1-5-pro-251215`), so the match is on that fragment; an id
* matching none takes the most conservative set, which rejects an oversized
* request before it is billed.
*/
const CAPS_BY_GENERATION = [
	{
		generation: /seedance[-_.]?2[-_.]?5/,
		caps: {
			minDuration: 4,
			maxDuration: 30,
			maxImageUrls: 30,
			maxVideoUrls: 10,
			maxAudioUrls: 10
		}
	},
	{
		generation: /seedance[-_.]?2[-_.]?0/,
		caps: {
			minDuration: 4,
			maxDuration: 15,
			maxImageUrls: 9,
			maxVideoUrls: 3,
			maxAudioUrls: 3
		}
	},
	{
		generation: /seedance[-_.]?1[-_.]?5/,
		caps: {
			minDuration: 4,
			maxDuration: 12,
			maxImageUrls: 2,
			maxVideoUrls: 0,
			maxAudioUrls: 0
		}
	}
];
/** The most conservative set Ark accepts, for an id this adapter cannot place. */
const CONSERVATIVE_CAPS = {
	minDuration: 2,
	maxDuration: 12,
	maxImageUrls: 2,
	maxVideoUrls: 0,
	maxAudioUrls: 0
};
/** Raised when neither the Settings page nor the credential store holds a key. */
var MissingCredentialError = class extends Error {
	code = "MISSING_CREDENTIAL";
	constructor(reference) {
		super(`media-ark: no API key configured — set one on the RoubaAI settings page or provide ${reference}`);
		this.name = "MissingCredentialError";
	}
};
/** Ark's status vocabulary mapped onto the normalized poll status. */
function normalizeStatus(status) {
	switch (status) {
		case "succeeded": return "succeeded";
		case "failed":
		case "expired": return "failed";
		default: return "running";
	}
}
/** Map the seam's generation mode onto Ark's task-type hint, when one applies. */
function arkTaskType(generationType) {
	switch (generationType) {
		case "reference": return "reference";
		case "video_edit": return "edit";
		default: return;
	}
}
/** Read one reference image URL out of a role-tagged entry. */
function imageUrlOf(entry) {
	if (typeof entry !== "object" || entry === null) return void 0;
	const record = entry;
	const raw = record["image_url"] ?? record["url"];
	if (typeof raw === "string") return raw;
	if (typeof raw === "object" && raw !== null) {
		const nested = raw["url"];
		return typeof nested === "string" ? nested : void 0;
	}
}
/** Read the role of a role-tagged entry, when it carries one. */
function roleOf(entry) {
	if (typeof entry !== "object" || entry === null) return void 0;
	const role = entry["role"];
	return typeof role === "string" && role.length > 0 ? role : void 0;
}
/**
* Build Ark's `content` array from the seam's provider-neutral input. Ark needs
* a role to place more than one image, so a lone `imageUrls` entry becomes the
* first frame and a set of them becomes reference images; a caller that means
* first-plus-last frame or a mixture says so through `imageWithRoles`, whose
* roles pass through verbatim.
* @param input - the provider-neutral generation input.
* @returns the ordered content entries.
*/
function buildContent(input) {
	const parts = [];
	if (input.prompt.trim().length > 0) parts.push({
		type: "text",
		text: input.prompt
	});
	const tagged = input.imageWithRoles ?? [];
	if (tagged.length > 0) for (const entry of tagged) {
		const url = imageUrlOf(entry);
		if (url === void 0) continue;
		const role = roleOf(entry);
		parts.push({
			type: "image_url",
			image_url: { url },
			...role === void 0 ? {} : { role }
		});
	}
	else {
		const urls = input.imageUrls ?? [];
		for (const url of urls) {
			const role = urls.length === 1 ? "first_frame" : "reference_image";
			parts.push({
				type: "image_url",
				image_url: { url },
				role
			});
		}
	}
	for (const url of input.videoUrls ?? []) parts.push({
		type: "video_url",
		video_url: { url },
		role: "reference_video"
	});
	for (const url of input.audioUrls ?? []) parts.push({
		type: "audio_url",
		audio_url: { url },
		role: "reference_audio"
	});
	return parts;
}
/** The model bounds an Ark id falls under. */
function capsForModel(model) {
	for (const entry of CAPS_BY_GENERATION) if (entry.generation.test(model)) return entry.caps;
	return CONSERVATIVE_CAPS;
}
/**
* A pollable handle caching the terminal `content.video_url` so `finalize` can
* probe it, plus the model the task was submitted with (Ark echoes no model on
* the task, and the result must name what actually ran).
*/
var ArkTaskHandle = class {
	baseUrl;
	resolveKey;
	taskId;
	model;
	constructor(taskId, model, baseUrl, resolveKey) {
		this.baseUrl = baseUrl;
		this.resolveKey = resolveKey;
		this.taskId = taskId;
		this.model = model;
	}
	async poll(signal) {
		let response;
		try {
			response = await getJson(`${this.baseUrl}/contents/generations/tasks/${this.taskId}`, await this.resolveKey(), signal);
		} catch (error) {
			throw isNetworkError(error) ? new ArkNetworkError(`Ark task ${this.taskId} poll ${error.message}`, error) : error;
		}
		const { status, data } = response;
		if (status !== 200) {
			if (status >= 400 && status < 500 && status !== 429) return {
				status: "failed",
				errorMsg: `${arkStatusMeaning(status)}（HTTP ${status}）`
			};
			return { status: "running" };
		}
		const task = data;
		const normalized = normalizeStatus(task.status);
		if (normalized === "succeeded") {
			const videoUrl = task.content?.video_url;
			if (typeof videoUrl !== "string" || videoUrl.length === 0) return {
				status: "failed",
				errorMsg: `Ark task ${this.taskId} succeeded without a video_url`
			};
			return {
				status: "succeeded",
				progress: 100,
				resultUrl: videoUrl
			};
		}
		if (normalized === "failed") return {
			status: "failed",
			errorMsg: task.error?.message ?? task.error?.code ?? `Ark task ${this.taskId} failed (${task.status ?? "unknown"})`
		};
		return { status: "running" };
	}
};
/**
* Volcengine Ark video provider. Submission creates one asynchronous task; the
* background job polls it and `finalize` probes the produced file.
*/
var ArkVideoProvider = class extends VideoProvider {
	ctx;
	provider = "ark";
	defaultModel;
	baseUrl;
	apiKeyEnv;
	settingsNamespace;
	constructor(ctx, config = {}) {
		super();
		this.ctx = ctx;
		this.baseUrl = config.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3";
		this.defaultModel = config.model ?? "doubao-seedance-1-5-pro-251215";
		this.apiKeyEnv = config.apiKeyEnv ?? "ARK_API_KEY";
		this.settingsNamespace = config.settingsNamespace ?? "roubaai-video-plugin";
	}
	/**
	* Resolve the API key per operation. The Settings page wins over the
	* credential store: it is the deployment's explicit per-install choice and
	* the one surface a person can edit without touching the environment. The
	* credential store — and through it `ARK_API_KEY` — stays the fallback, so a
	* deployment that never opens the Settings page is unaffected.
	* @returns the resolved key.
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
	* Default model: the Settings page's override when one is stored, else the
	* deployment-configured model. A caller's explicit `input.model` still wins.
	*/
	resolveModel() {
		return readActiveMediaProvider(this.ctx, this.settingsNamespace, "video").model ?? this.defaultModel;
	}
	caps(model) {
		return capsForModel(model ?? this.resolveModel());
	}
	/**
	* Ark bills in RMB per second, so this adapter states no USD figure; the
	* ledger records the run unpriced instead of converting at a rate it does
	* not own.
	* @returns always `undefined`.
	*/
	estimateCostUsd() {}
	async submit(input, signal) {
		const apiKey = await this.resolveKey();
		const model = input.model ?? this.resolveModel();
		const payload = {
			model,
			content: buildContent(input)
		};
		if (input.size !== void 0) payload["ratio"] = input.size;
		if (input.duration !== void 0) payload["duration"] = input.duration;
		if (input.resolution !== void 0) payload["resolution"] = input.resolution;
		if (input.generateAudio !== void 0) payload["generate_audio"] = input.generateAudio;
		if (input.returnLastFrame !== void 0) payload["return_last_frame"] = input.returnLastFrame;
		if (input.outputFormat !== void 0) payload["output_format"] = input.outputFormat;
		if (input.callbackUrl !== void 0) payload["callback_url"] = input.callbackUrl;
		if (input.watermark !== void 0) payload["watermark"] = input.watermark;
		if (input.seed !== void 0) payload["seed"] = input.seed;
		const taskType = arkTaskType(input.generationType);
		if (taskType !== void 0) payload["omni_reference_task_type"] = taskType;
		let response;
		try {
			response = await postJson(`${this.resolveBaseUrl()}/contents/generations/tasks`, apiKey, payload, signal);
		} catch (error) {
			throw isNetworkError(error) ? new ArkNetworkError(`Ark video submission ${error.message}`, error) : error;
		}
		const { status, data } = response;
		if (status !== 200) throw new ArkHttpError(`Ark video submission failed [${status}] ${arkStatusMeaning(status)}`, status);
		const taskId = data.id;
		if (typeof taskId !== "string" || taskId.length === 0) throw new ArkHttpError("Ark video submission returned no task id", 200);
		return new ArkTaskHandle(taskId, model, this.resolveBaseUrl(), () => this.resolveKey());
	}
	async finalize(handle, signal, onProgress) {
		const url = (await handle.poll(signal)).resultUrl;
		if (url === void 0) throw new ArkHttpError(`Ark task ${handle.taskId} has no result URL to probe`);
		onProgress?.({
			phase: "downloading",
			percent: 0
		});
		let probe;
		try {
			probe = await probeResult(url, signal !== void 0 ? AbortSignal.any([signal, AbortSignal.timeout(VIDEO_PROBE_TIMEOUT_MS)]) : AbortSignal.timeout(VIDEO_PROBE_TIMEOUT_MS));
		} catch (error) {
			throw isNetworkError(error) ? new ArkNetworkError(`Ark task ${handle.taskId} result probe ${error.message}`, error) : error;
		}
		if (probe === void 0 || probe.status < 200 || probe.status >= 300) throw new ArkHttpError(`Ark task ${handle.taskId} result URL is unreachable [${probe?.status ?? "no-body"}]`, probe?.status);
		onProgress?.({
			phase: "saving",
			percent: 100
		});
		return {
			kind: "video",
			mediaType: "video/mp4",
			mediaRef: {
				url,
				mediaType: "video/mp4",
				...probe.sizeBytes === void 0 ? {} : { sizeBytes: probe.sizeBytes },
				expiresAt: Date.now() + MEDIA_URL_TTL_MS
			},
			providerMeta: {
				provider: this.provider,
				model: handle instanceof ArkTaskHandle ? handle.model : this.defaultModel,
				taskId: handle.taskId
			}
		};
	}
	/**
	* Probe the endpoint and key the configuration form holds. A read-only task
	* lookup: an id that cannot exist answers 404, which proves the key
	* authenticated and the service answered without creating a task.
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
			const { status } = await getJson(`${base}/contents/generations/tasks/connection-probe`, draft.apiKey);
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
			const { status } = await getJson(`${this.resolveBaseUrl()}/contents/generations/tasks/connection-probe`, apiKey);
			return status < 500 && status !== 401 && status !== 403;
		} catch {
			return false;
		}
	}
};
//#endregion
//#region lib/types/index.js
/**
* Volcengine Ark media provider plugin: registers the video provider with
* `ctx.media`. Registering a provider is all that is needed to wire it to
* `generate_video`, which stays provider-agnostic — the Settings page selects
* this adapter by naming `ark` on the active video row.
* @module @roubaai/media-ark
*/
const name = "roubaai-media-ark";
const inject = ["media", "credentials"];
function apply(ctx, config = {}) {
	const disposeVideo = ctx.media.registerVideoProvider(new ArkVideoProvider(ctx, {
		...config.baseUrl !== void 0 ? { baseUrl: config.baseUrl } : {},
		...config.videoModel !== void 0 ? { model: config.videoModel } : {},
		...config.apiKeyEnv !== void 0 ? { apiKeyEnv: config.apiKeyEnv } : {},
		...config.settingsNamespace !== void 0 ? { settingsNamespace: config.settingsNamespace } : {}
	}));
	return () => {
		disposeVideo();
	};
}
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { ARK_API_KEY_REF, ARK_VIDEO_BASE_URL, ArkVideoProvider, DEFAULT_SETTINGS_NAMESPACE, DEFAULT_VIDEO_MODEL, MissingCredentialError, apply, types_default as default, inject, name };
