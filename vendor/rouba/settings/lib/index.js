import { DEFAULT_PROVIDER_ID, MEDIA_CATEGORY_DEFAULTS, MEDIA_CATEGORY_DEFAULT_ADAPTERS, ROUBAAI_SETTINGS_NS } from "./shared.js";
import { RoubaaiMediaSettingsSchema } from "./config.js";
//#region lib/types/adapters.js
/**
* The Settings page's view of `ctx.media`: which adapters this deployment
* mounted, and how a row's connectivity probe reaches the adapter that owns it.
*
* Both faces are structural rather than an import of `@roubaai/media`, so the
* configuration package stays independent of any backend package and keeps
* working on a surface where no media plugin is mounted at all. This module
* lives beside the route rather than inside it so each half is testable without
* booting a web server.
* @module @roubaai/settings/adapters
*/
/**
* Registry names of the providers this deployment mounted, per category. The
* Settings page offers them as a row's adapter, so the deployment's own plugin
* composition — never this package — decides what a row may point at.
* @param ctx - the plugin context (the media service is optional).
* @returns one registry-name list per category; every list empty without it.
*/
function adapterCatalog(ctx) {
	const media = ctx.get("media");
	if (media === void 0) return {
		image: [],
		video: [],
		music: []
	};
	try {
		return {
			image: media.listImageProviders(),
			video: media.listVideoProviders(),
			music: media.listMusicProviders()
		};
	} catch {
		return {
			image: [],
			video: [],
			music: []
		};
	}
}
/**
* Run the selected adapter's own probe. Every "cannot" — no adapter named, no
* media service, an adapter this deployment did not mount, a provider without a
* probe — returns `undefined` so the caller keeps its generic endpoint probe.
* @param ctx - the plugin context (the media service is optional).
* @param category - which category's registry to look the adapter up in.
* @param adapter - the registry name the row names; empty when unset.
* @param draft - the values the form shows.
* @returns the probe's outcome, or `undefined` to fall back.
*/
async function probeViaAdapter(ctx, category, adapter, draft) {
	if (adapter === "") return void 0;
	const media = ctx.get("media");
	if (media === void 0) return void 0;
	let provider;
	try {
		provider = media[category](adapter);
	} catch {
		return;
	}
	const probe = provider.probe;
	if (typeof probe !== "function") return void 0;
	return await probe.call(provider, draft);
}
//#endregion
//#region lib/types/index.js
/**
* Host half of `@roubaai/settings`: owns the provider-configuration
* settings namespace and serves it to the Web configuration surface through
* the plugin's own fenced JSON route.
*
* The namespace is registered HERE, in the host plane, for two reasons: the
* registration is then a process-wide singleton (an agent preset's isolated
* realm registers and unregisters per session, which would make a settings
* namespace flicker with the session lifecycle), and the write path stays on
* the same plane as the settings document it persists to.
*
* The route exists because the DSH settings RPC domain serves only allowlisted
* namespaces to configuration clients: a third-party namespace reaches its own
* browser surface through a fenced route that calls the settings seam
* in-process. Reads are always redacted (no API key crosses the wire); writes
* are revision-guarded so a stale editor is refused instead of silently
* overwriting a concurrent change.
*
* On mount the plugin migrates the pre-3-category flat shape (one shared
* `apiKey`/`baseUrl` + per-kind model overrides) into the per-category
* provider structure, then rewrites the user section without the legacy
* fields — a one-time, idempotent rewrite guarded by the legacy fields'
* presence.
* @module @roubaai/settings
*/
/**
* Stable Cordis plugin name. Intentionally NOT the settings namespace: the
* namespace (`ROUBAAI_SETTINGS_NS`) is the data contract the media providers
* read, so it stays put even when this package's npm name changes.
*/
const name = "roubaai-settings";
/** Services required before the namespace and its route can be mounted. */
const inject = ["webServer", "settings"];
/** The JSON API prefix (`POST <prefix>/<method>`). */
const API_PREFIX = "/api/roubaai-video";
/** Upper bound on one connection test (the browser waits on this route). */
const TEST_TIMEOUT_MS = 15e3;
/** Upper bound on a JSON request body (the settings patch is tiny). */
const MAX_BODY_BYTES = 64 * 1024;
/** Wire code of a refused stale write (mirrors `SettingsConflictError.code`). */
const CONFLICT_CODE = "SETTINGS_CONFLICT";
/**
* Whether a request comes from this origin. A browser sends `Origin` on every
* cross-origin POST and on same-origin POSTs with a non-GET method, so a
* present-but-foreign `Origin` is refused: it is the one header a page on
* another host cannot forge or suppress. A request with no `Origin` at all is
* a non-browser client (the CLI, curl, an integration), which no CSRF page can
* produce, so it is admitted.
* @param req - the incoming request.
* @returns whether the request may reach the handlers.
*/
function isSameOrigin(req) {
	const host = req.headers.host;
	const origin = req.headers.origin;
	if (host === void 0 || host === "") return false;
	if (origin === void 0 || origin === "") return true;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
/**
* Send one JSON envelope. Every response — success and failure alike — uses
* this shape so the client has a single parse path.
* @param res - the response to write.
* @param status - the HTTP status.
* @param body - the JSON-serializable body.
*/
function writeJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(text),
		"cache-control": "no-store"
	});
	res.end(text);
}
/** Send one failure envelope (`{ ok: false, error: { code, message } }`). */
function writeError(res, status, code, message) {
	writeJson(res, status, {
		ok: false,
		error: {
			code,
			message
		}
	});
}
/**
* Read the request body as JSON, bounded. A body past the cap (or one that is
* not an object) is refused before any handler sees it: this route writes
* credentials, so its input is never trusted and never unbounded.
* @param req - the incoming request.
* @returns the parsed object body.
*/
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.byteLength;
		if (size > MAX_BODY_BYTES) throw new Error(`request body exceeds ${String(MAX_BODY_BYTES)} bytes`);
		chunks.push(buffer);
	}
	if (chunks.length === 0) return {};
	const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("request body must be a JSON object");
	return parsed;
}
/**
* Probe a provider endpoint with a key: one `GET /models` on the
* OpenAI-compatible base. It is the cheapest request that still proves both
* halves of the configuration — the endpoint answers, and the key is accepted
* — without spending a generation. The caller supplies the values it is
* looking at (an unsaved key included), so a key can be verified in the same
* breath it is typed.
*
* @param baseUrl - the endpoint base to probe.
* @param apiKey - the key to present.
* @returns whether the endpoint answered favorably, plus the human reason.
*/
async function testConnection(baseUrl, apiKey) {
	if (apiKey.trim() === "") return {
		ok: false,
		message: "未填写 API Key"
	};
	const base = baseUrl.trim().replace(/\/+$/, "");
	if (base === "") return {
		ok: false,
		message: "未填写接口地址"
	};
	try {
		const response = await fetch(`${base}/models`, {
			method: "GET",
			headers: {
				authorization: `Bearer ${apiKey}`,
				accept: "application/json"
			},
			signal: AbortSignal.timeout(TEST_TIMEOUT_MS)
		});
		if (response.ok) return {
			ok: true,
			message: `连接成功（HTTP ${String(response.status)}）`
		};
		return {
			ok: false,
			message: response.status === 401 || response.status === 403 ? `API Key 被拒绝（HTTP ${String(response.status)}）` : `端点返回 HTTP ${String(response.status)}`
		};
	} catch (error) {
		return {
			ok: false,
			message: `无法连接端点：${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* One-time migration: fold the legacy flat shape into the per-category
* structure. The old document held one shared Maizi key/endpoint plus
* per-kind model overrides; they become each category's default provider
* (and the music key its own). Idempotent: the rewrite drops the legacy
* fields, so the guard (any legacy key set) fires at most once.
* @param ctx - the plugin context carrying the settings service.
*/
async function migrateLegacySettings(ctx) {
	const value = ctx.settings.describe().find((candidate) => candidate.ns === ROUBAAI_SETTINGS_NS)?.value;
	if (typeof value !== "object" || value === null) return;
	const string = (key) => typeof value[key] === "string" ? value[key] : "";
	const apiKey = string("apiKey");
	const musicApiKey = string("musicApiKey");
	if (apiKey === "" && musicApiKey === "" && string("baseUrl") === "" && string("imageModel") === "" && string("videoModel") === "" && string("musicModel") === "") return;
	const baseUrl = string("baseUrl");
	const sharedKey = apiKey === "" ? {} : {
		[`${DEFAULT_PROVIDER_ID}:image`]: apiKey,
		[`${DEFAULT_PROVIDER_ID}:video`]: apiKey
	};
	await ctx.settings.replace(ROUBAAI_SETTINGS_NS, {
		image: {
			activeId: DEFAULT_PROVIDER_ID,
			providers: [{
				id: `${DEFAULT_PROVIDER_ID}:image`,
				name: "",
				custom: false,
				adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS.image,
				baseUrl,
				model: string("imageModel")
			}]
		},
		video: {
			activeId: DEFAULT_PROVIDER_ID,
			providers: [{
				id: `${DEFAULT_PROVIDER_ID}:video`,
				name: "",
				custom: false,
				adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS.video,
				baseUrl,
				model: string("videoModel")
			}]
		},
		music: {
			activeId: DEFAULT_PROVIDER_ID,
			providers: [{
				id: `${DEFAULT_PROVIDER_ID}:music`,
				name: "",
				custom: false,
				adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS.music,
				baseUrl: MEDIA_CATEGORY_DEFAULTS.music.baseUrl,
				model: string("musicModel")
			}]
		},
		keys: {
			...sharedKey,
			...musicApiKey === "" ? {} : { [`${DEFAULT_PROVIDER_ID}:music`]: musicApiKey }
		}
	});
}
/**
* Probe the music provider endpoint with a key. The music API is not
* OpenAI-compatible: it has no `GET /models`, so the cheapest authenticated
* probe is a task lookup — an unknown id answers a business-JSON 404 ("任务
* 不存在"), which still proves the endpoint is reachable and the key accepted
* (an unauthorized key is refused before the id is ever read).
*
* @param baseUrl - the music endpoint base (…/api/v2/music).
* @param apiKey - the key to present.
* @returns whether the endpoint answered favorably, plus the human reason.
*/
async function testMusicConnection(baseUrl, apiKey) {
	if (apiKey.trim() === "") return {
		ok: false,
		message: "未填写 API Key"
	};
	const base = baseUrl.trim().replace(/\/+$/, "");
	if (base === "") return {
		ok: false,
		message: "未填写接口地址"
	};
	try {
		const response = await fetch(`${base}/task?id=connection-probe`, {
			method: "GET",
			headers: {
				authorization: `Bearer ${apiKey}`,
				accept: "application/json"
			},
			signal: AbortSignal.timeout(TEST_TIMEOUT_MS)
		});
		if (response.ok) return {
			ok: true,
			message: `连接成功（HTTP ${String(response.status)}）`
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
			message: response.status === 401 || response.status === 403 ? `API Key 被拒绝（HTTP ${String(response.status)}）` : `端点返回 HTTP ${String(response.status)}`
		};
	} catch (error) {
		return {
			ok: false,
			message: `无法连接端点：${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* Register the provider-configuration namespace and mount its fenced JSON
* route.
*
* Three methods share the prefix: `settings.get` (redacted view, revision, and
* the adapter catalog the deployment mounted), `settings.update`
* (revision-guarded deep-merge patch), and `test` (a probe against the values
* the caller is looking at, an unsaved key included — run by the row's adapter
* when it implements one, else by the generic endpoint probe). The legacy
* migration runs once before the route mounts.
* @param ctx - plugin context carrying the webServer and settings services.
*/
function apply(ctx) {
	ctx.settings.register(ROUBAAI_SETTINGS_NS, RoubaaiMediaSettingsSchema);
	/** The redacted view of this namespace (secrets absent, slots enumerated). */
	const viewOf = () => {
		const descriptor = ctx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === ROUBAAI_SETTINGS_NS);
		if (descriptor === void 0) return {
			value: void 0,
			revision: void 0,
			secrets: []
		};
		return {
			value: descriptor.value,
			revision: descriptor.revision,
			secrets: descriptor.secrets ?? []
		};
	};
	const handlers = {
		"settings.get": async () => ({
			...viewOf(),
			adapters: adapterCatalog(ctx)
		}),
		"settings.update": async (payload) => {
			const patch = payload["patch"];
			if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new Error("patch must be an object");
			const expected = payload["expectedRevision"];
			const expectedRevision = typeof expected === "number" ? expected : void 0;
			try {
				await ctx.settings.update(ROUBAAI_SETTINGS_NS, patch, expectedRevision);
			} catch (error) {
				if ((error instanceof Error && "code" in error ? String(error.code) : "") === CONFLICT_CODE) {
					const failure = /* @__PURE__ */ new Error("配置已被其他端修改，请刷新后重试");
					failure.status = 409;
					throw failure;
				}
				throw error;
			}
			return viewOf();
		},
		"test": async (payload) => {
			const baseUrl = typeof payload["baseUrl"] === "string" ? payload["baseUrl"] : "";
			const apiKey = typeof payload["apiKey"] === "string" ? payload["apiKey"] : "";
			const kind = payload["kind"];
			const category = kind === "music" || kind === "image" ? kind : "video";
			const model = typeof payload["model"] === "string" && payload["model"].length > 0 ? payload["model"] : void 0;
			const own = await probeViaAdapter(ctx, category, typeof payload["adapter"] === "string" ? payload["adapter"] : "", {
				baseUrl,
				apiKey,
				...model === void 0 ? {} : { model }
			});
			if (own !== void 0) return own;
			return category === "music" ? testMusicConnection(baseUrl, apiKey) : testConnection(baseUrl, apiKey);
		}
	};
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: API_PREFIX,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				writeError(res, 405, "method-error", "method not allowed");
				return;
			}
			if (!isSameOrigin(req)) {
				writeError(res, 403, "forbidden", "cross-origin request refused");
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith(`/api/roubaai-video/`) ? pathname.slice(19) : void 0;
			const handler = method === void 0 ? void 0 : handlers[method];
			if (handler === void 0) {
				writeError(res, 404, "not-found", `unknown roubaai video API method "${method ?? ""}"`);
				return;
			}
			try {
				writeJson(res, 200, {
					ok: true,
					value: await handler(await readJsonBody(req))
				});
			} catch (error) {
				const status = error instanceof Error && "status" in error ? Number(error.status) : void 0;
				const message = error instanceof Error ? error.message : String(error);
				writeError(res, Number.isFinite(status) && (status ?? 0) >= 400 ? status ?? 500 : 500, status === 409 ? "settings-conflict" : "handler-error", message);
			}
		}
	}), `@roubaai/settings: ${API_PREFIX} routes`);
	migrateLegacySettings(ctx).catch(() => {});
}
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { API_PREFIX, apply, types_default as default, inject, name, testConnection, testMusicConnection };
