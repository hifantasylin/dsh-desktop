import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { MusicProvider, readActiveMediaProvider } from "@roubaai/media";
//#region lib/types/settings-config.js
/**
* The settings namespace the roubaai video plugin's Settings page owns. The
* per-operation read of the active music provider (key, model) lives in
* `@roubaai/media`'s `readActiveMediaProvider`, which this package consumes.
* @module @roubaai/media-mxapi/settings-config
*/
/** Namespace the roubaai video plugin's Settings page owns. */
const DEFAULT_SETTINGS_NAMESPACE = "roubaai-video-plugin";
/** Raised on non-2xx or non-`code:200` responses, and on a missing credential. */
var MxapiApiError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.name = "MxapiApiError";
		this.status = status;
	}
};
var MissingCredentialError = class extends Error {
	envVar;
	constructor(envVar) {
		super(`MxAPI credential "${envVar}" is not configured`);
		this.name = "MissingCredentialError";
		this.envVar = envVar;
	}
};
/**
* MxAPI music provider (Suno v2 submit/poll). Resolve the API key per
* operation through `ctx.credentials`; never persist it.
*/
var MxapiMusicProvider = class extends MusicProvider {
	provider = "mxapi";
	defaultModel;
	ctx;
	baseUrl;
	apiKeyEnv;
	constructor(ctx, config = {}) {
		super();
		this.ctx = ctx;
		this.baseUrl = (config.baseUrl ?? "https://open.mxapi.org/api/v2/music").replace(/\/$/, "");
		this.defaultModel = config.model ?? "chirp-bluejay";
		this.apiKeyEnv = config.apiKeyEnv ?? "MXAPI_API_KEY";
	}
	/**
	* Resolve the API key for one operation: the Settings page's active music
	* provider wins, then the credential store (`MXAPI_API_KEY`) — the same
	* order the Maizi providers use (settings first, then credentials/env).
	*/
	async resolveKey() {
		const stored = readActiveMediaProvider(this.ctx, DEFAULT_SETTINGS_NAMESPACE, "music").apiKey;
		if (stored !== void 0) return stored;
		const credentials = this.ctx.get("credentials");
		if (credentials === void 0) throw new MissingCredentialError(this.apiKeyEnv);
		const hit = await credentials.resolve(credentialRef(this.apiKeyEnv));
		if (hit === void 0 || hit.value === void 0 || hit.value === "") throw new MissingCredentialError(this.apiKeyEnv);
		return hit.value;
	}
	async request(path, init, signal) {
		const apiKey = await this.resolveKey();
		const response = await fetch(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...init?.headers
			},
			...signal !== void 0 ? { signal } : {}
		});
		if (!response.ok) throw new MxapiApiError(`MxAPI ${path} failed (HTTP ${response.status})`, response.status);
		const body = await response.json();
		if (body.code !== 200 || body.data === void 0) throw new MxapiApiError(`MxAPI ${path} rejected: ${body.message ?? `code ${body.code ?? "unknown"}`}`);
		return body.data;
	}
	async submit(input, signal) {
		const payload = { mv: input.model ?? readActiveMediaProvider(this.ctx, "roubaai-video-plugin", "music").model ?? this.defaultModel };
		if (input.description !== void 0 && input.description.trim().length > 0) payload["gpt_description_prompt"] = input.description;
		else {
			payload["prompt"] = input.lyrics;
			if (input.tags !== void 0) payload["tags"] = input.tags;
		}
		if (input.negativeTags !== void 0) payload["negative_tags"] = input.negativeTags;
		if (input.title !== void 0) payload["title"] = input.title;
		if (input.instrumental !== void 0) payload["make_instrumental"] = input.instrumental;
		const metadata = {};
		if (input.vocalGender !== void 0) metadata["vocal_gender"] = input.vocalGender;
		const sliders = {};
		if (input.styleWeight !== void 0) sliders["style_weight"] = input.styleWeight;
		if (input.weirdnessConstraint !== void 0) sliders["weirdness_constraint"] = input.weirdnessConstraint;
		if (Object.keys(sliders).length > 0) metadata["control_sliders"] = sliders;
		if (Object.keys(metadata).length > 0) payload["metadata"] = metadata;
		const taskIds = (await this.request("/generate", {
			method: "POST",
			body: JSON.stringify(payload)
		}, signal)).task_ids ?? [];
		if (taskIds.length === 0) throw new MxapiApiError("MxAPI generate returned no task ids");
		return taskIds.map((taskId) => ({
			taskId,
			poll: (pollSignal) => this.pollTask(taskId, pollSignal ?? signal)
		}));
	}
	/** Poll one task, normalizing MxAPI's dual status fields. */
	async pollTask(taskId, signal) {
		const task = await this.request(`/task?id=${encodeURIComponent(taskId)}`, { method: "GET" }, signal);
		const supplierStatus = task.result?.status;
		if (supplierStatus === 3 || task.status === "completed") return {
			status: "succeeded",
			progress: 100
		};
		if (supplierStatus === 4 || task.status === "failed") return {
			status: "failed",
			errorMsg: task.result?.error ?? task.error ?? "music generation failed"
		};
		return {
			status: "running",
			...task.result?.progress !== void 0 ? { progress: task.result.progress } : {}
		};
	}
	/** Fetch the terminal track info for a task that polled `succeeded`. */
	async fetchTrack(taskId, signal) {
		const task = await this.request(`/task?id=${encodeURIComponent(taskId)}`, { method: "GET" }, signal);
		const info = task.result?.fileInfo;
		const audioUrl = info?.mp3Url;
		if (audioUrl === void 0 || audioUrl === "") throw new MxapiApiError(`MxAPI task ${taskId} completed without an mp3 URL`);
		return {
			audioUrl,
			...task.result?.custom_id !== void 0 ? { clipId: task.result.custom_id } : {},
			...info?.duration !== void 0 ? { durationSeconds: info.duration } : {},
			...info?.cosUrl !== void 0 && info.cosUrl !== "" ? { coverUrl: info.cosUrl } : {}
		};
	}
	/**
	* Probe the endpoint and key a configuration form holds. The music API is not
	* OpenAI-compatible and has no `GET /models`, so the cheapest authenticated
	* request is a task lookup: an unknown id answers a business-JSON 404, which
	* still proves the endpoint is reachable and the key accepted (an
	* unauthorized key is refused before the id is read).
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
			const response = await fetch(`${base}/task?id=connection-probe`, {
				method: "GET",
				headers: {
					authorization: `Bearer ${draft.apiKey}`,
					accept: "application/json"
				},
				signal: AbortSignal.timeout(15e3)
			});
			if (response.ok) return {
				ok: true,
				message: `连接成功（HTTP ${response.status}）`
			};
			if (response.status === 404) {
				const body = await response.json().catch(() => void 0);
				if (typeof body === "object" && body !== null && body["code"] !== void 0) return {
					ok: true,
					message: `连接成功（HTTP 404，${String(body["message"] ?? "任务不存在")}）`
				};
			}
			return {
				ok: false,
				message: response.status === 401 || response.status === 403 ? `API Key 被拒绝（HTTP ${response.status}）` : `端点返回 HTTP ${response.status}`
			};
		} catch (error) {
			return {
				ok: false,
				message: `无法连接端点：${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	/** Connectivity test: resolves the key, then issues a cheap task probe. */
	async testConnection() {
		try {
			await this.request("/task?id=connection-probe", { method: "GET" });
			return true;
		} catch (error) {
			if (error instanceof MissingCredentialError) return false;
			return !(error instanceof MxapiApiError && error.status === 401);
		}
	}
};
//#endregion
//#region lib/types/index.js
/**
* MxAPI music provider plugin: registers the music provider with `ctx.media`.
* Registering a provider is all that is needed to wire it to the
* `generate_music` tool (which stays provider-agnostic).
*
* @module @roubaai/media-mxapi
*/
const name = "roubaai-media-mxapi";
const inject = ["media", "credentials"];
function apply(ctx, config = {}) {
	return ctx.media.registerMusicProvider(new MxapiMusicProvider(ctx, {
		...config.baseUrl !== void 0 ? { baseUrl: config.baseUrl } : {},
		...config.model !== void 0 ? { model: config.model } : {},
		...config.apiKeyEnv !== void 0 ? { apiKeyEnv: config.apiKeyEnv } : {}
	}));
}
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { MissingCredentialError, MxapiApiError, MxapiMusicProvider, apply, types_default as default, inject, name };
