import { Service } from "@deepseek-ai/cordis";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative } from "node:path";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { tmpdir } from "node:os";
//#region lib/types/media-local.js
/**
* Process-local media provider registry (`ctx.media` implementation). The
* registry is itself the whitelist: only explicitly registered providers are
* reachable, and a missing registration surfaces as a `NO_PROVIDER` error
* (distinct from `MISSING_CREDENTIAL`, which the provider raises when its own
* credential resolve returns `undefined`).
*
* Registration is reversible: `register*Provider` returns a disposer and
* binds to the apply fiber, so unloading the provider plugin withdraws its
* providers (design constraint #2 — no global side effect left behind).
*
* @module @roubaai/media/media-local
*/
/** Raised when `image()`/`video()`/`music()` find no registered provider (or none by name). */
var NoProviderError = class extends Error {
	code = "NO_PROVIDER";
	constructor(message) {
		super(message);
		this.name = "NoProviderError";
	}
};
/** The process-local media registry, registered as `ctx.media`. */
var MediaRuntimeLocal = class extends Service {
	images = /* @__PURE__ */ new Map();
	videos = /* @__PURE__ */ new Map();
	musics = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "media");
	}
	registerImageProvider(provider) {
		const name = provider.provider;
		if (typeof name !== "string" || name.length === 0) throw new Error("media: an image provider needs a non-empty provider name");
		if (this.images.has(name)) throw new Error(`media: image provider "${name}" is already registered`);
		const dispose = this.ctx.effect(function* () {
			this.images.set(name, provider);
			yield () => {
				this.images.delete(name);
			};
		}.bind(this), "media.registerImageProvider()");
		return () => void dispose();
	}
	registerVideoProvider(provider) {
		const name = provider.provider;
		if (typeof name !== "string" || name.length === 0) throw new Error("media: a video provider needs a non-empty provider name");
		if (this.videos.has(name)) throw new Error(`media: video provider "${name}" is already registered`);
		const dispose = this.ctx.effect(function* () {
			this.videos.set(name, provider);
			yield () => {
				this.videos.delete(name);
			};
		}.bind(this), "media.registerVideoProvider()");
		return () => void dispose();
	}
	image(provider) {
		if (provider !== void 0) {
			const found = this.images.get(provider);
			if (found === void 0) throw new NoProviderError(`media: no image provider registered under "${provider}"`);
			return found;
		}
		const first = this.images.values().next().value;
		if (first === void 0) throw new NoProviderError("media: no image provider is registered");
		return first;
	}
	video(provider) {
		if (provider !== void 0) {
			const found = this.videos.get(provider);
			if (found === void 0) throw new NoProviderError(`media: no video provider registered under "${provider}"`);
			return found;
		}
		const first = this.videos.values().next().value;
		if (first === void 0) throw new NoProviderError("media: no video provider is registered");
		return first;
	}
	registerMusicProvider(provider) {
		const name = provider.provider;
		if (typeof name !== "string" || name.length === 0) throw new Error("media: a music provider needs a non-empty provider name");
		if (this.musics.has(name)) throw new Error(`media: music provider "${name}" is already registered`);
		const dispose = this.ctx.effect(function* () {
			this.musics.set(name, provider);
			yield () => {
				this.musics.delete(name);
			};
		}.bind(this), "media.registerMusicProvider()");
		return () => void dispose();
	}
	music(provider) {
		if (provider !== void 0) {
			const found = this.musics.get(provider);
			if (found === void 0) throw new NoProviderError(`media: no music provider registered under "${provider}"`);
			return found;
		}
		const first = this.musics.values().next().value;
		if (first === void 0) throw new NoProviderError("media: no music provider is registered");
		return first;
	}
	listImageProviders() {
		return [...this.images.keys()];
	}
	listVideoProviders() {
		return [...this.videos.keys()];
	}
	listMusicProviders() {
		return [...this.musics.keys()];
	}
};
//#endregion
//#region lib/types/tunnel.js
/**
* Local reference-media URL normalizer (`ctx.mediaUrl`).
*
* The `generate_image` / `generate_video` providers only accept a reachable
* public https URL for reference images (`refImages` / `imageUrls`); local
* file paths and base64 are rejected upstream. This service turns a local
* reference image path into a public URL on demand by running a tiny static
* file server over the video project directory and a Cloudflare quick tunnel
* in front of it, then caching the tunnel base URL for the lifetime of the
* media fiber.
*
* Lifecycle: lazily started on the first local reference it sees (so an
* install that never passes local references never spawns a server or
* tunnel), and torn down when the owning `ctx` fiber disposes.
*
* @module @roubaai/media/tunnel
*/
/** Local static-server port in front of the tunnel. */
const STATIC_PORT = Number(process.env.DSH_MEDIA_STATIC_PORT ?? 8765);
/** DSH host base URL used to resolve host-local `/...` reference routes. */
const HOST_BASE$1 = (process.env.DSH_MEDIA_HOST ?? "http://127.0.0.1:3080").replace(/\/$/, "");
/** Path to the cloudflared binary shipped with the remote web gateway plugin. */
const CLOUDFLARED_BIN = process.env.DSH_MEDIA_CLOUDFLARED_BIN ?? "C:/Users/Administrator/.dsh/plugins/dsh-remote-web-gateway/bin/cache/cloudflared.exe";
/** MIME map served by the static server (extended with common media types). */
const MIME = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".mp4": "video/mp4",
	".md": "text/markdown",
	".json": "application/json",
	".txt": "text/plain"
};
/** True when `value` is a public https URL the provider can reach directly. */
function isPublicUrl(value) {
	return /^https:\/\//i.test(value);
}
/** True when `value` is a host-local http URL or a `/...` route the provider cannot reach. */
function isHostLocalUrl(value) {
	if (value.startsWith("/")) return true;
	return /^http:\/\/(127\.0\.0\.1|localhost|::1)(:\d+)?/i.test(value);
}
/** True when `value` looks like a local path (Windows drive / file URL / bare path). */
function isLocalPath(value) {
	if (/^[a-zA-Z]:[\\/]/.test(value)) return true;
	if (value.startsWith("file://")) return true;
	return false;
}
/**
* The local reference normalizer service. Registered as `ctx.mediaUrl` for
* the lifetime of the media apply fiber; started lazily and disposed with it.
*/
var MediaUrlNormalizer = class extends Service {
	server;
	tunnel;
	baseUrl;
	starting;
	/** The fixed workspace root that `/_local/...` serves files from. */
	root;
	constructor(ctx) {
		super(ctx, "mediaUrl");
		this.ctx.effect(function* () {
			yield () => {
				this.teardown();
			};
		}.bind(this), "media.mediaUrl");
	}
	/** Normalize a single reference value into a public https URL the provider can reach. */
	async normalize(ref, workspaceRoot) {
		if (isPublicUrl(ref)) return ref;
		if (isHostLocalUrl(ref)) {
			const absolute = ref.startsWith("/") ? `${HOST_BASE$1}${ref}` : ref;
			return `${await this.ensureStarted()}/_proxy/${encodeURIComponent(absolute)}`;
		}
		if (isLocalPath(ref)) {
			const base = await this.ensureStarted(workspaceRoot);
			const root = this.root ?? workspaceRoot ?? process.cwd();
			return `${base}/_local/${this.toPublicPath(ref, root)}`;
		}
		return ref;
	}
	/** Normalize an array of reference values in place. */
	async normalizeAll(refs, workspaceRoot) {
		return Promise.all(refs.map((ref) => this.normalize(ref, workspaceRoot)));
	}
	/**
	* Lazily start the static server + tunnel and return the cached tunnel
	* base URL. Concurrent callers share a single startup promise. The first
	* call pins the workspace root that `/_local/...` serves from.
	*/
	ensureStarted(workspaceRoot) {
		if (this.baseUrl !== void 0) return Promise.resolve(this.baseUrl);
		if (this.starting !== void 0) return this.starting;
		this.root = workspaceRoot ?? process.cwd();
		this.starting = this.start();
		return this.starting;
	}
	async start() {
		await this.ensureServer();
		const url = await this.startTunnel();
		this.baseUrl = url;
		return url;
	}
	async ensureServer() {
		if (this.server !== void 0) return;
		const server = createServer((req, res) => {
			this.serve(req, res);
		});
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(STATIC_PORT, "127.0.0.1", () => resolve());
		});
		this.server = server;
	}
	async serve(req, res) {
		try {
			const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`).pathname;
			if (pathname.startsWith("/_proxy/")) {
				const target = decodeURIComponent(pathname.slice(8));
				const upstream = await fetch(target, { signal: AbortSignal.timeout(6e4) });
				const body = Buffer.from(await upstream.arrayBuffer());
				const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
				res.writeHead(upstream.status, {
					"Content-Type": contentType,
					"Content-Length": body.length
				});
				res.end(body);
				return;
			}
			if (pathname.startsWith("/_local/") && this.root !== void 0) {
				const rel = decodeURIComponent(pathname.slice(8));
				const filePath = normalize(join(this.root, rel));
				if (!filePath.startsWith(normalize(this.root))) {
					res.writeHead(403, { "Content-Type": "text/plain" }).end("Forbidden");
					return;
				}
				const data = await readFile(filePath);
				res.writeHead(200, { "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream" }).end(data);
				return;
			}
			res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
		} catch {
			res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
		}
	}
	/** Spawn cloudflared and wait for the printed tunnel URL. */
	startTunnel() {
		return new Promise((resolve, reject) => {
			if (!existsSync(CLOUDFLARED_BIN)) {
				reject(/* @__PURE__ */ new Error(`mediaUrl: cloudflared binary not found at ${CLOUDFLARED_BIN}`));
				return;
			}
			const tunnel = spawn(CLOUDFLARED_BIN, [
				"tunnel",
				"--url",
				`http://127.0.0.1:${STATIC_PORT}`,
				"--no-autoupdate"
			], {
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				],
				windowsHide: true
			});
			const timer = setTimeout(() => {
				tunnel.kill();
				reject(/* @__PURE__ */ new Error("mediaUrl: cloudflared tunnel timed out starting"));
			}, 3e4);
			let stderr = "";
			tunnel.stderr?.on("data", (chunk) => {
				stderr += chunk.toString();
				const baseUrl = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i.exec(stderr)?.[1];
				if (baseUrl !== void 0) {
					clearTimeout(timer);
					this.tunnel = tunnel;
					resolve(baseUrl);
				}
			});
			tunnel.once("error", (err) => {
				clearTimeout(timer);
				reject(err);
			});
			tunnel.once("exit", (code) => {
				if (this.tunnel !== tunnel) {
					clearTimeout(timer);
					reject(/* @__PURE__ */ new Error(`mediaUrl: cloudflared exited early (code ${String(code)})`));
				}
			});
		});
	}
	/** Map a local path to the static server's public URL path, relative to the workspace root. */
	toPublicPath(ref, root) {
		let normalized = ref;
		if (normalized.startsWith("file://")) try {
			normalized = decodeURIComponent(new URL(normalized).pathname);
		} catch {
			normalized = normalized.replace(/^file:\/\//, "");
		}
		if (isAbsolute(normalized)) {
			const rel = relative(root, normalized);
			if (!rel.startsWith("..") && !isAbsolute(rel)) return rel.replace(/\\/g, "/");
			normalized = normalized.replace(/^[a-zA-Z]:/, "");
		}
		return normalized.replace(/\\/g, "/").replace(/^\/+/, "");
	}
	teardown() {
		if (this.tunnel !== void 0) {
			try {
				this.tunnel.kill();
			} catch {}
			this.tunnel = void 0;
		}
		if (this.server !== void 0) {
			try {
				this.server.close();
			} catch {}
			this.server = void 0;
		}
		this.baseUrl = void 0;
		this.starting = void 0;
	}
};
//#endregion
//#region lib/types/media-cache.js
/**
* Local media cache + signed same-origin stream routes.
*
* Generated video/audio URLs are provider CDNs (24h validity); streaming them
* straight into the browser is slow and dies on expiry. This module mirrors
* the host's attachment pattern for media: the bytes are pulled to the local
* machine once (generation or `media_asset_save`) and the browser later plays
* them from the harness itself — fast, seekable, offline of the provider.
*
* Design (same-origin, no extra port, no arbitrary file reads):
* - Downloads run in the BACKGROUND after a generation job settles, so the job
*   completes and the tool card appears immediately with the provider URL.
* - Every cached file is registered here under its content hash; the stream
*   route serves ONLY registered ids and demands an HMAC signature over
*   `id:expiry`, so a cross-site page cannot read local files by path.
* - The routes live on the host webserver (`/api/roubaai-media/...`) — the
*   page's own origin — so `<video>`/`<audio>`/`<img>` load them without
*   CORS/port issues, and the client can poll `lookup` to learn when the
*   background download finished and switch the player source to local.
*
* A restarted host invalidates outstanding signatures (new per-process
* secret); players then fall back to the provider URL they already carry.
* @module @roubaai/media/media-cache
*/
/** Route prefix on the host webserver. */
const MEDIA_ROUTE_PREFIX = "/api/roubaai-media";
/** Pathname (under the prefix) serving one registered media file. */
const MEDIA_STREAM_PATH = "/media";
/** Pathname (under the prefix) answering whether one CDN URL is cached locally. */
const MEDIA_LOOKUP_PATH = "/lookup";
/** Signed URLs stay valid for the provider CDN window; a restarted host invalidates them anyway. */
const CACHE_TTL_MS = 1440 * 60 * 1e3;
/** Maximum bytes accepted from one provider download. */
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
/** Hard cap on one background download so a slow provider cannot pin a process. */
const DOWNLOAD_TIMEOUT_MS = 12e4;
const cacheById = /* @__PURE__ */ new Map();
const cacheByUrl = /* @__PURE__ */ new Map();
let secret;
/**
* The system-level media cache root. Every download lands here — a single,
* process-independent directory (`$DSH_HOME/media-cache`, falling back to the
* host cwd) shared across projects and restarts — so `restoreCacheFromDisk`
* can rebuild the file mapping from one directory and the signature secret
* stays consistent across every workspace. `DSH_MEDIA_CACHE_DIR` overrides it
* for deployments with a pinned data dir.
*/
function cacheRoot() {
	const pinned = process.env.DSH_MEDIA_CACHE_DIR;
	if (pinned !== void 0 && pinned !== "") return pinned;
	const home = process.env.DSH_HOME;
	return home !== void 0 && home !== "" ? join(home, "media-cache") : join(process.cwd(), ".media-cache");
}
/**
* The stream signature secret, persisted to disk so a restarted host keeps
* serving previously minted local URLs (and the on-disk cache stays usable).
* Created lazily so headless installs never write a secret file.
*/
function signingSecret() {
	if (secret !== void 0) return secret;
	const file = join(cacheRoot(), ".secret");
	try {
		if (existsSync(file)) {
			const hex = readFileSync(file, "utf8").trim();
			if (/^[0-9a-f]{64}$/i.test(hex)) {
				secret = Buffer.from(hex, "hex");
				return secret;
			}
		}
	} catch {}
	secret = randomBytes(32);
	try {
		mkdirSync(cacheRoot(), { recursive: true });
		writeFileSync(file, secret.toString("hex"));
	} catch {}
	return secret;
}
/** MIME for a cached file extension (used to rebuild `cacheById` from disk). */
function mimeOfExt(ext) {
	switch (ext) {
		case "mp4":
		case "m4v": return "video/mp4";
		case "webm": return "video/webm";
		case "mov": return "video/quicktime";
		case "mp3": return "audio/mpeg";
		case "m4a": return "audio/mp4";
		case "wav": return "audio/wav";
		case "aac": return "audio/aac";
		case "ogg":
		case "oga": return "audio/ogg";
		case "png": return "image/png";
		case "jpg":
		case "jpeg": return "image/jpeg";
		case "webp": return "image/webp";
		case "gif": return "image/gif";
		default: return;
	}
}
/**
* Rebuild `cacheById` from the cache dir so a restarted host keeps serving
* previously minted local stream URLs. The signature secret now persists
* across restarts, so the URL still validates — this restores the file→id
* mapping that otherwise lives only in process memory. Files are named
* `<id>.<ext>`, enough to recover the id and MIME; `sourceUrl` is unknown and
* left empty (it is only used for a cache-eviction path, never for serving).
*/
function restoreCacheFromDisk() {
	const dir = cacheRoot();
	let names;
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) {
		if (name === ".secret") continue;
		const match = /^([0-9a-f]{24})\.([a-z0-9]+)$/i.exec(name);
		if (match === null) continue;
		const id = match[1];
		const ext = match[2];
		if (id === void 0 || ext === void 0) continue;
		if (cacheById.has(id)) continue;
		const mediaType = mimeOfExt(ext.toLowerCase());
		if (mediaType === void 0) continue;
		cacheById.set(id, {
			file: join(dir, name),
			mediaType,
			sourceUrl: ""
		});
	}
}
/** Constant-time signature check over `id:exp`. */
function signatureValid(id, exp, sig) {
	const expected = createHmac("sha256", signingSecret()).update(`${id}:${exp}`).digest();
	const received = Buffer.from(sig, "hex");
	return received.length === expected.length && timingSafeEqual(received, expected);
}
/** Strip an extension to a safe disk fragment (no separators, empty → 'bin'). */
function safeExt(ext) {
	const cleaned = ext.replace(/[^a-z0-9]/gi, "").toLowerCase();
	return cleaned === "" ? "bin" : cleaned;
}
/** Content id of one source URL. */
function idOf(url) {
	return createHash("sha256").update(url).digest("hex").slice(0, 24);
}
/** Build the signed same-origin stream URL for one cache id. */
function signedUrl(id) {
	const exp = Date.now() + CACHE_TTL_MS;
	const sig = createHmac("sha256", signingSecret()).update(`${id}:${exp}`).digest("hex");
	return `${MEDIA_ROUTE_PREFIX}${MEDIA_STREAM_PATH}?id=${id}&exp=${exp}&sig=${sig}`;
}
/** Pathname extension of a remote URL, if any. */
function pathExtension(url) {
	try {
		const pathname = new URL(url).pathname;
		const dot = pathname.lastIndexOf(".");
		return dot < 0 ? void 0 : pathname.slice(dot + 1);
	} catch {
		return;
	}
}
/**
* Fetch the remote bytes and write them under the cache dir.
* @returns the written file path.
*/
async function downloadTo(url, dir, ext, signal) {
	const response = await fetch(url, {
		redirect: "follow",
		signal
	});
	if (!response.ok) throw new Error(`download failed (HTTP ${String(response.status)})`);
	if (Number(response.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) throw new Error(`payload exceeds the ${MAX_DOWNLOAD_BYTES}-byte cache cap`);
	const data = new Uint8Array(await response.arrayBuffer());
	if (data.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`payload exceeds the ${MAX_DOWNLOAD_BYTES}-byte cache cap`);
	await mkdir(dir, { recursive: true });
	const file = join(dir, `${idOf(url)}.${safeExt(ext)}`);
	await writeFile(file, data);
	return file;
}
/** Register already-local bytes under their source URL (media_asset_save reuse). */
function registerLocalMedia(options) {
	const { url, filePath, mediaType } = options;
	const id = idOf(url);
	if (cacheById.has(id)) return signedUrl(id);
	cacheById.set(id, {
		file: filePath,
		mediaType,
		sourceUrl: url
	});
	cacheByUrl.set(url, filePath);
	return signedUrl(id);
}
/** Same-origin signed URL for a source URL this process already cached. */
function lookupCachedMediaUrl(url) {
	return cacheByUrl.has(url) ? signedUrl(idOf(url)) : void 0;
}
/** Re-read a cached file's bytes (media_asset_save reuse path). */
async function cachedMediaBytes(url) {
	const file = cacheByUrl.get(url);
	if (file === void 0) return void 0;
	try {
		return new Uint8Array(await readFile(file));
	} catch {
		return;
	}
}
/**
* Synchronously download one provider URL into the fixed cache dir and return
* its same-origin signed stream URL. The caller (a generation tool) awaits
* this BEFORE settling the job, so `job_output` already carries the local URL
* and the player never touches the slow CDN. On any failure the promise
* resolves to `undefined` and the caller falls back to the CDN URL it already
* has — the job still completes.
* @param options - provider URL, media MIME, extension fallback, diagnostics.
* @returns the signed local stream URL, or undefined when caching failed.
*/
async function downloadToCache(options) {
	const { url, mediaType, fallbackExt, log } = options;
	const already = lookupCachedMediaUrl(url);
	if (already !== void 0) return already;
	const ext = pathExtension(url) ?? fallbackExt;
	const dir = cacheRoot();
	let signal;
	try {
		signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
	} catch {
		log?.("media cache: AbortSignal.timeout unavailable; CDN URL stays in use");
		return;
	}
	try {
		return registerLocalMedia({
			url,
			filePath: await downloadTo(url, dir, ext, signal),
			mediaType
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		log?.(`media cache: download failed for ${url} (${reason}); CDN URL stays in use`);
		return;
	}
}
/** Range header parse: {start,end} in bytes, or undefined for a full response. */
function parseRange(header, size) {
	if (header === void 0) return void 0;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (match === null) return void 0;
	const [, startRaw, endRaw] = match;
	if (startRaw === void 0 || startRaw === "") return void 0;
	const start = Number(startRaw);
	if (!Number.isSafeInteger(start) || start < 0 || start >= size) return void 0;
	const end = endRaw !== void 0 && endRaw !== "" ? Math.min(Number(endRaw), size - 1) : size - 1;
	if (!Number.isSafeInteger(end) || end < start) return void 0;
	return {
		start,
		end
	};
}
/** Serve one registered cache file with Range + correct MIME. */
async function serveEntry(res, entry, req) {
	let size;
	try {
		size = (await stat(entry.file)).size;
	} catch {
		cacheById.delete(idOf(entry.sourceUrl));
		res.writeHead(404).end("missing");
		return;
	}
	res.setHeader("content-type", entry.mediaType);
	res.setHeader("accept-ranges", "bytes");
	res.setHeader("cache-control", "private, max-age=3600");
	const range = parseRange(req.headers.range, size);
	if (req.method === "HEAD") {
		res.writeHead(range === void 0 ? 200 : 206, { ...range === void 0 ? { "content-length": String(size) } : {
			"content-range": `bytes ${range.start}-${range.end}/${size}`,
			"content-length": String(range.end - range.start + 1)
		} });
		res.end();
		return;
	}
	if (range === void 0) {
		res.writeHead(200, { "content-length": String(size) });
		createReadStream(entry.file).pipe(res);
		return;
	}
	res.writeHead(206, {
		"content-range": `bytes ${range.start}-${range.end}/${size}`,
		"content-length": String(range.end - range.start + 1)
	});
	createReadStream(entry.file, {
		start: range.start,
		end: range.end
	}).pipe(res);
}
/**
* Register the same-origin media routes on the host webserver:
* - `<prefix>/media?id=…&exp=…&sig=…` — signed stream of one registered file;
* - `<prefix>/lookup?url=<cdn>` — JSON `{ mediaUrl }` when the URL is cached,
*   else `{ mediaUrl: null }` (the client polls this to switch to local).
* @param webServer - the host webserver service (routes share its origin).
* @returns the disposer removing the routes.
*/
function registerWebRoutes(webServer) {
	restoreCacheFromDisk();
	return webServer.register({
		kind: "prefix",
		path: MEDIA_ROUTE_PREFIX,
		handler: (req, res) => {
			(async () => {
				try {
					const url = new URL(req.url ?? "/", "http://dsh.local");
					const pathname = url.pathname.slice(18) || "/";
					if (pathname === MEDIA_STREAM_PATH) {
						const id = url.searchParams.get("id") ?? "";
						const exp = url.searchParams.get("exp") ?? "";
						const sig = url.searchParams.get("sig") ?? "";
						const entry = cacheById.get(id);
						if (entry === void 0 || !signatureValid(id, exp, sig) || Number(exp) < Date.now()) {
							res.writeHead(403).end("forbidden");
							return;
						}
						await serveEntry(res, entry, req);
						return;
					}
					if (pathname === MEDIA_LOOKUP_PATH) {
						const source = url.searchParams.get("url");
						const mediaUrl = source === null ? void 0 : lookupCachedMediaUrl(source);
						res.writeHead(200, {
							"content-type": "application/json; charset=utf-8",
							"cache-control": "no-store"
						});
						res.end(JSON.stringify({ mediaUrl: mediaUrl ?? null }));
						return;
					}
					res.writeHead(404).end("not found");
				} catch {
					if (!res.headersSent) res.writeHead(500);
					res.end();
				}
			})();
		}
	});
}
//#endregion
//#region lib/types/settings-lookup.js
/**
* Bridge from the roubaai settings page to the media providers: resolve which
* provider one category currently routes to, plus that provider's API key,
* endpoint base, and default model, out of the settings namespace the
* `@roubaai/settings` page owns.
*
* The page stores one row per configured backend and marks one of them active.
* A row's `adapter` is the registry name of the provider that serves it, so the
* tools resolve the provider by adapter rather than taking whichever one
* happens to be registered first — several backends may be mounted at once.
*
* Reads are PER OPERATION and OPTIONAL in every direction: a deployment without
* the settings service, without the plugin, or with an unreadable document
* falls straight through to `undefined`, and the caller keeps its registry
* default. That is why the service is reached through `ctx.get` rather than an
* `inject` entry — providers must keep loading on surfaces that carry no
* settings service.
*
* The built-in fallbacks mirror the providers' own runtime constants
* (`@roubaai/media-maizi` and `@roubaai/media-mxapi`); the settings page's
* browser half carries a synced copy so its display agrees with what runs.
* @module @roubaai/media/settings-lookup
*/
/**
* Settings namespace holding the provider configuration. `@roubaai/settings`
* owns the stored shape; this id is the shared data contract between the page
* and the media tools, so it stays fixed across package renames.
*/
const MEDIA_SETTINGS_NAMESPACE = "roubaai-video-plugin";
/** Read one non-empty string, else ''. */
function string(entry) {
	return typeof entry === "string" && entry.length > 0 ? entry : "";
}
/**
* Locate the active row of one category in the settings document. Every failure
* — no settings service, no namespace, a throwing descriptor, a malformed
* document — resolves to an absent entry, which callers read as "unconfigured".
* @param ctx - the plugin context (the settings service is optional).
* @param namespace - the settings namespace the settings page owns.
* @param category - which category's active row to locate.
* @returns the active row, the key map, and the resolved active id.
*/
function lookupActiveEntry(ctx, namespace, category) {
	const settings = ctx.get("settings");
	if (settings === void 0) return {
		entry: void 0,
		keys: {},
		activeId: ""
	};
	let value;
	try {
		value = settings.describe().find((descriptor) => descriptor.ns === namespace)?.value;
	} catch {
		return {
			entry: void 0,
			keys: {},
			activeId: ""
		};
	}
	if (typeof value !== "object" || value === null) return {
		entry: void 0,
		keys: {},
		activeId: ""
	};
	const record = value;
	const categoryValue = typeof record[category] === "object" && record[category] !== null ? record[category] : void 0;
	const keys = typeof record["keys"] === "object" && record["keys"] !== null ? record["keys"] : {};
	const providers = Array.isArray(categoryValue?.["providers"]) ? categoryValue["providers"] : [];
	const activeId = string(categoryValue?.["activeId"]) || `default:${category}`;
	for (const candidate of providers) if (typeof candidate === "object" && candidate !== null && candidate["id"] === activeId) return {
		entry: candidate,
		keys,
		activeId
	};
	return {
		entry: void 0,
		keys,
		activeId
	};
}
/**
* Resolve the provider one category currently uses. Overrides come back
* absent when unset, so each consumer keeps its own fallback priority
* (settings page → deployment config → built-in default).
* @param ctx - the plugin context (the settings service is optional).
* @param namespace - the settings namespace the settings page owns.
* @param category - which category's active provider to resolve.
* @returns the key and overrides; every field absent when unconfigured.
*/
function readActiveMediaProvider(ctx, namespace, category) {
	const { entry, keys, activeId } = lookupActiveEntry(ctx, namespace, category);
	const apiKey = string(keys[activeId]);
	const baseUrl = string(entry?.["baseUrl"]);
	const model = string(entry?.["model"]);
	return {
		...apiKey === "" ? {} : { apiKey },
		...baseUrl === "" ? {} : { baseUrl },
		...model === "" ? {} : { model }
	};
}
/**
* Registry name of the provider the settings page routes one category to, or
* `undefined` when nothing selects one — no settings service, no namespace, or
* a row stored before adapters existed. Callers resolve `undefined` to the
* registry default, which is the backend an unconfigured deployment has always
* used.
* @param ctx - the plugin context (the settings service is optional).
* @param category - which category's active adapter to resolve.
* @param namespace - the settings namespace the settings page owns.
* @returns the adapter's registry name, or `undefined` when none is configured.
*/
function readActiveAdapter(ctx, category, namespace = MEDIA_SETTINGS_NAMESPACE) {
	const { entry } = lookupActiveEntry(ctx, namespace, category);
	const adapter = string(entry?.["adapter"]);
	return adapter === "" ? void 0 : adapter;
}
//#endregion
//#region lib/types/cost-ledger.js
/**
* Media cost ledger — automatic, append-only per-completion record of media
* generation cost. The `generate_image` / `generate_video` / `generate_music`
* tools write one line per completed job themselves, so cost tracking is
* reliable even when the agent forgets to record it. The ledger lives at
* `<workspace>/.assets/media-cost.jsonl` (one JSON object per line); the
* `media_cost_summary` tool folds it into an owner/model-readable total and
* drives the cost-tracker document's actual-vs-expected comparison.
*
* @module @roubaai/media/cost-ledger
*/
/**
* Ledger file for one project: `<workspace>/.assets/<project>/media-cost.jsonl`.
* A missing project — or one that is actually the workspace path itself (the
* generate tools fall back to the workspace when the model omits `project`) —
* falls back to `<workspace>/.assets/default/media-cost.jsonl`, so the
* workspace's cost data stays in the workspace `.assets` tree under the
* `default` project rather than under a mangled absolute-path directory.
*/
function ledgerPath(workspace, project) {
	return join(workspace, ".assets", project === void 0 || project.length === 0 || isAbsolute(project) ? "default" : project.replace(/[\\/:*?"<>|]/g, "_"), "media-cost.jsonl");
}
/** True when the same (project, label) already exists in the ledger. */
async function isRetry(workspace, project, label) {
	if (label === void 0) return false;
	return (await readLedger(workspace, project)).some((entry) => entry.project === project && entry.label === label);
}
/** Append one completion record; `retry` is computed automatically. Returns the full record. */
async function appendMediaCost(workspace, entry) {
	const full = {
		...entry,
		retry: await isRetry(workspace, entry.project, entry.label)
	};
	const filePath = ledgerPath(workspace, entry.project);
	await mkdir(dirname(filePath), { recursive: true });
	await appendFile(filePath, `${JSON.stringify(full)}\n`, "utf8");
	return full;
}
/** Read one ledger file, skipping malformed lines. */
async function readLedgerFile(filePath) {
	let content = "";
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return [];
	}
	const entries = [];
	for (const line of content.split("\n")) {
		if (line.trim().length === 0) continue;
		try {
			entries.push(JSON.parse(line));
		} catch {}
	}
	return entries;
}
/**
* Read ledger entries. With a project, reads only that project's file
* (`<workspace>/.assets/<project>/media-cost.jsonl`); without one, scans every
* project directory under `.assets/` (including `default`) so a workspace-wide
* summary folds all projects together.
*/
async function readLedger(workspace, project) {
	if (project !== void 0) return readLedgerFile(ledgerPath(workspace, project));
	const assetsDir = join(workspace, ".assets");
	let dirs;
	try {
		dirs = (await readdir(assetsDir, { withFileTypes: true })).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
	} catch {
		return [];
	}
	const all = [];
	for (const dir of dirs) all.push(...await readLedgerFile(join(assetsDir, dir, "media-cost.jsonl")));
	return all;
}
/** Fold the ledger into a summary (newest label first). */
async function summarizeMediaCost(workspace, filter) {
	const entries = (await readLedger(workspace, filter?.project)).filter((entry) => filter?.since === void 0 || entry.ts >= filter.since);
	const byLabel = /* @__PURE__ */ new Map();
	const byTool = /* @__PURE__ */ new Map();
	let totalUsd = 0;
	let retryCount = 0;
	let retryUsd = 0;
	for (const entry of entries) {
		totalUsd += entry.costUsd;
		if (entry.retry) {
			retryCount++;
			retryUsd += entry.costUsd;
		}
		const tool = byTool.get(entry.tool) ?? {
			tool: entry.tool,
			count: 0,
			totalUsd: 0
		};
		tool.count++;
		tool.totalUsd += entry.costUsd;
		byTool.set(entry.tool, tool);
		if (entry.label !== void 0) {
			const key = `${entry.project}\u0000${entry.label}`;
			const prior = byLabel.get(key);
			if (prior === void 0) byLabel.set(key, {
				project: entry.project,
				label: entry.label,
				firstUsd: entry.costUsd,
				retries: entry.retry ? 1 : 0,
				totalUsd: entry.costUsd,
				lastTs: entry.ts
			});
			else {
				prior.retries += entry.retry ? 1 : 0;
				prior.totalUsd += entry.costUsd;
				prior.lastTs = Math.max(prior.lastTs, entry.ts);
			}
		}
	}
	return {
		totalUsd,
		totalCount: entries.length,
		retryCount,
		retryUsd,
		byLabel: [...byLabel.values()].sort((a, b) => b.totalUsd - a.totalUsd),
		byTool: [...byTool.values()].sort((a, b) => b.totalUsd - a.totalUsd)
	};
}
//#endregion
//#region lib/types/tools/media-asset-save.js
/**
* `media_asset_save` tool: persist an AI-generated image or video (or an
* uploaded reference image) into the current session's on-disk asset library,
* under a deterministic category path and a friendly name, then append an
* entry to the asset index.
*
* Assets live on disk (not as URLs) so they survive provider URL expiry (24h)
* and tunnel-domain changes; later video-generation steps re-publish a needed
* asset to a fresh public URL with `media_reference_url`.
*
* The save runs in the background (`ctx.jobs`), mirroring `generate_image`:
* `execute` returns immediately with a job id, and the bytes are fetched and
* written asynchronously. On completion a message is delivered to the owner's
* session with the saved path.
*
* The asset root is the current session's working directory
* (`agent.session.header.cwd`, falling back to `process.cwd()`), mirroring how
* `dsh-agent-teams` scopes its `.agent-teams/` state to the caller's workspace:
*   `<cwd>/.assets/<category>/<name>.png|.mp4`
*   `<cwd>/.assets/assets-index.md`
*
* The `reference` parameter accepts every shape the model may actually have in
* context: an attachment JSON object, a host-local image URL, a host-local
* video URL, a public https URL, a local path, a bare sha256 id, or a Markdown
* image reference. The tool figures out the type and saves the bytes.
*
* @module @roubaai/media/tools/media-asset-save
*/
const name$7 = "media_asset_save";
/** DSH host base URL used to resolve host-local `/...` references. */
const HOST_BASE = (process.env.DSH_MEDIA_HOST ?? "http://127.0.0.1:3080").replace(/\/$/, "");
/** Allowed asset categories (English ids; 项目名等用户指定内容才用中文). */
const CATEGORIES$1 = [
	"upload",
	"character",
	"scene",
	"prop",
	"keyframe",
	"video",
	"storyboard",
	"cover",
	"meta"
];
/** The media types a stored attachment may claim, with their file extensions. */
const STORED_MEDIA_EXTENSIONS = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif"
};
/**
* Sniff the image media type from magic bytes. The attachment store content-
* addresses by sha256, so a bare id arrives without its media type; the stored
* bytes themselves are the source of truth.
* @param data - the stored bytes.
* @returns the sniffed media type, or image/png when unrecognized.
*/
function sniffStoredMediaType(data) {
	if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) return "image/png";
	if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
	if (data.length >= 6 && data[0] === 71 && data[1] === 73 && data[2] === 70) return "image/gif";
	if (data.length >= 12 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) return "image/webp";
	return "image/png";
}
/** The caller's workspace directory (team state root parent pattern). */
function workspaceOf(agent) {
	return agent?.session?.header?.cwd ?? process.cwd();
}
/** Normalize any reference shape the model may have into a fetchable/readable source. */
function resolveSource(input) {
	const value = (/!\[[^\]]*\]\(([^)]+)\)/.exec(input)?.[1] ?? input).trim();
	if (value.startsWith("{")) try {
		const parsed = JSON.parse(value);
		const flat = parsed;
		const pub = jsonPublicUrl(parsed);
		const withUrl = { ...pub !== void 0 ? { publicUrl: pub } : {} };
		if (typeof flat.attachmentId === "string" && typeof flat.mediaType === "string") return {
			kind: "attachment",
			ref: flat,
			...withUrl
		};
		const nested = parsed.attachment;
		if (nested !== void 0 && typeof nested === "object" && typeof nested.attachmentId === "string" && typeof nested.mediaType === "string") return {
			kind: "attachment",
			ref: nested,
			...withUrl
		};
		const mediaRef = parsed.mediaRef;
		if (mediaRef !== void 0 && typeof mediaRef === "object" && typeof mediaRef.url === "string" && mediaRef.url.length > 0) return {
			kind: "url",
			url: mediaRef.url
		};
	} catch {}
	if (/^https:\/\//i.test(value)) return {
		kind: "url",
		url: value
	};
	if (value.startsWith("/")) return {
		kind: "url",
		url: `${HOST_BASE}${value}`
	};
	if (/^[a-zA-Z]:[\\/]/.test(value)) return {
		kind: "local",
		path: value
	};
	if (value.startsWith("file://")) return {
		kind: "local",
		path: value.replace(/^file:\/\//, "")
	};
	if (/^sha256:[0-9a-f]{8,64}$/.test(value)) return {
		kind: "attachment-id",
		attachmentId: value
	};
}
/**
* Eagerly resolve a bare content-addressed id into stored bytes: the id keys
* the local attachment store directly (`imageHostPath` validates the id and
* derives the object path), so no host HTTP route and no re-download is
* involved.
* @param ctx - the plugin context carrying the attachments service.
* @param value - the bare `sha256:...` id.
* @returns the stored bytes with their sniffed media type, or undefined when
*   the service cannot resolve host paths (a non-file backend) or the object
*   is missing.
*/
async function storedImageBytes(ctx, value) {
	const attachments = ctx.get("attachments");
	if (attachments === void 0) return void 0;
	const placeholder = {
		attachmentId: value,
		mediaType: "image/png",
		bytes: 0,
		width: 0,
		height: 0
	};
	const hostPath = attachments.imageHostPath(placeholder);
	if (hostPath === void 0) return void 0;
	try {
		const data = new Uint8Array(await readFile(hostPath));
		return {
			data,
			mediaType: sniffStoredMediaType(data)
		};
	} catch {
		return;
	}
}
/**
* Pull the provider's 24h result URL out of a mediaRef-wrapper JSON, so the
* asset index can record it even when the save itself runs off the local
* attachment library. Checks `resultUrl` (image landed path) and
* `mediaRef.url` (video / degraded image); host-local and non-https values
* are skipped — the index column means a provider/public URL.
*/
function jsonPublicUrl(parsed) {
	const candidates = [parsed.resultUrl, parsed.mediaRef?.url];
	for (const candidate of candidates) if (typeof candidate === "string" && /^https:\/\//i.test(candidate)) return candidate;
}
function registerMediaAssetSave(ctx) {
	const disposers = [];
	disposers.push(ctx.tools.register(defineTool({
		name: name$7,
		description: "Persist a generated image/video (or an uploaded reference) into the project asset library so it survives URL expiry and can be reused. Background job: returns a job id, message posts when done. Call after generate_image/generate_video when you want to keep the asset, or to save an uploaded reference. reference accepts any form you have in context (Markdown image, attachment JSON from job output, host URL, public https URL, sha256 id, or local path; video → its mediaRef url).",
		parameters: {
			reference: {
				type: "string",
				required: true,
				description: "The image/video to persist: Markdown image, attachment JSON from job output, host URL (/describe-image/raw/... or /api/media.stream/...), public https URL, sha256 id, or local path. Video → its mediaRef url."
			},
			project: {
				type: "string",
				required: true,
				description: "Project folder name. The asset is saved under `<workspace>/.assets/<project>/`."
			},
			category: {
				type: "string",
				enum: [...CATEGORIES$1],
				required: true,
				description: "Asset category: assets-index 类别标签（目录由 dir 决定）。upload (用户原图) / character / scene / prop / keyframe / video (视频成片；多集 name 用 EPxx/ 子路径，如 EP01/镜01_巨兽冲进广场) / meta (导演工作图与示意类图片，如情绪曲线；非资产，不参与生成、不作参考图) / cover. storyboard 已弃用（历史兼容），新视频一律 video。"
			},
			dir: {
				type: "string",
				required: true,
				description: "落盘子目录（相对 `.assets/<project>/`，决定最终路径），由 LLM 按项目实际结构传参，如 `01_角色/CH001_花十/02_定稿图`。不得含 `..`、盘符或前导 `/`。"
			},
			name: {
				type: "string",
				required: true,
				description: "Friendly file base name without extension. May include sub-paths with `/` to organize assets, e.g. `小美/服装/礼服` becomes `<dir|category>/小美/服装/礼服.png`; plain names like `肉宝_三视图_v1` stay flat. Must not contain `..` or drive letters."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "background"
					},
					jobId: {
						type: "string",
						required: true
					},
					target: {
						type: "string",
						required: true,
						description: "Planned destination path."
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Started background asset-save job ${value.jobId}; saving to ${value.target}`
			}]
		},
		async execute(args, exec) {
			let source = resolveSource(args.reference);
			if (source === void 0) throw new Error("media_asset_save: could not resolve the reference into an image or video; pass a Markdown image, attachment JSON, host URL (/describe-image/raw/... or /api/media.stream/...), public https URL, sha256 id, or local path");
			if (source.kind === "attachment-id") {
				const stored = await storedImageBytes(ctx, source.attachmentId);
				if (stored === void 0) throw new Error(`media_asset_save: attachment ${source.attachmentId} is not in the local attachment store; pass the full attachment JSON from the job output instead`);
				source = {
					kind: "stored-image",
					data: stored.data,
					mediaType: stored.mediaType
				};
			}
			const category = args.category;
			if (!CATEGORIES$1.includes(category)) throw new Error(`media_asset_save: unsupported category ${category}; use one of ${CATEGORIES$1.join(", ")}`);
			const workspace = workspaceOf(exec.agent);
			const isVideo = source.kind === "url" ? isVideoUrl(source.url) : source.kind === "attachment" ? source.ref.mediaType.includes("video") : false;
			const isAudio = !isVideo && (source.kind === "url" ? isAudioUrl(source.url) : source.kind === "attachment" ? source.ref.mediaType.includes("audio") : false);
			const ext = source.kind === "stored-image" ? STORED_MEDIA_EXTENSIONS[source.mediaType] ?? "png" : isVideo ? "mp4" : isAudio ? "mp3" : "png";
			if (/\.\./.test(args.name) || /^[a-zA-Z]:[\\/]/.test(args.name) || args.name.startsWith("/")) throw new Error("media_asset_save: name must be a relative sub-path without `..` or drive letters");
			const safeName = args.name.replace(/[\\:*?"<>|]/g, "_");
			if (typeof args.dir !== "string" || args.dir.trim() === "") throw new Error("media_asset_save: dir is required — landing sub-directory under `.assets/<project>/`, e.g. `01_角色/CH001_花十/02_定稿图`");
			if (/\.\./.test(args.dir) || /^[a-zA-Z]:[\\/]/.test(args.dir) || args.dir.startsWith("/")) throw new Error("media_asset_save: dir must be a relative sub-path without `..` or drive letters");
			const safeDir = args.dir.replace(/[\\:*?"<>|]/g, "_");
			const projectDir = join(workspace, ".assets", args.project);
			const filePath = join(projectDir, safeDir, `${safeName}.${ext}`);
			return {
				kind: "background",
				jobId: ctx.jobs.start({
					kind: "media-asset",
					label: `media_asset_save:${safeDir}/${safeName}`,
					...exec.agent !== void 0 ? { owner: exec.agent } : {},
					run: () => {
						const ac = new AbortController();
						return {
							cancel: (reason) => {
								ac.abort(reason);
							},
							done: (async () => {
								try {
									const data = await fetchBytes(ctx, source, ac.signal);
									await mkdir(dirname(filePath), { recursive: true });
									await writeFile(filePath, data);
									await appendIndex(projectDir, {
										category,
										name: safeName,
										path: filePath,
										ref: args.reference,
										url: (source.kind === "url" ? source.url : source.publicUrl) ?? extractPublicUrl(args.reference),
										ts: Date.now(),
										mediaType: ext
									});
									const displayUrl = source.kind === "url" ? source.url : source.publicUrl;
									if (displayUrl !== void 0) registerLocalMedia({
										url: displayUrl,
										filePath,
										mediaType: mediaMimeOf(ext)
									});
									return {
										status: "completed",
										output: JSON.stringify({
											path: filePath,
											sizeBytes: data.byteLength,
											mediaType: ext
										})
									};
								} catch (error) {
									if (ac.signal.aborted) return {
										status: "failed",
										detail: "aborted"
									};
									return {
										status: "failed",
										detail: error instanceof Error ? error.message : String(error)
									};
								}
							})()
						};
					}
				}),
				target: filePath
			};
		},
		presentCall(args) {
			return {
				card: "generic",
				title: `Save asset ${args.name}`,
				kind: "execute",
				rawInput: `${args.dir}/${args.name}`
			};
		}
	})));
	return () => {
		for (const dispose of disposers) dispose();
	};
}
/** True when a URL looks like a video source (host media.stream or a .mp4/… public URL). */
function isVideoUrl(url) {
	return /\/api\/media\.stream\//i.test(url) || /\.mp4(\?|$)/i.test(url) || /\/videos?\//i.test(url);
}
/** True when a URL looks like an audio source (.mp3/.wav — e.g. Suno CDN track URLs). */
function isAudioUrl(url) {
	return /\.mp3(\?|$)/i.test(url) || /\.wav(\?|$)/i.test(url) || /\.m4a(\?|$)/i.test(url);
}
/** MIME for a saved file extension (media cache registration + asset index). */
function mediaMimeOf(ext) {
	switch (ext) {
		case "png": return "image/png";
		case "jpg":
		case "jpeg": return "image/jpeg";
		case "webp": return "image/webp";
		case "gif": return "image/gif";
		case "mp4":
		case "m4v": return "video/mp4";
		case "webm": return "video/webm";
		case "mov": return "video/quicktime";
		case "mp3": return "audio/mpeg";
		case "m4a": return "audio/mp4";
		case "wav": return "audio/wav";
		case "aac": return "audio/aac";
		case "ogg":
		case "oga": return "audio/ogg";
		default: return "application/octet-stream";
	}
}
/** Fetch/read the bytes for a resolved source. */
async function fetchBytes(ctx, source, signal) {
	switch (source.kind) {
		case "attachment": return (await ctx.attachments.readImage(source.ref, signal)).data;
		case "stored-image": return source.data;
		case "url": {
			const cached = await cachedMediaBytes(source.url);
			if (cached !== void 0) return cached;
			const resp = await fetch(source.url, signal !== void 0 ? { signal } : void 0);
			if (!resp.ok) throw new Error(`media_asset_save: download failed (HTTP ${resp.status}) for ${source.url}`);
			return new Uint8Array(await resp.arrayBuffer());
		}
		case "local": return new Uint8Array(await readFile(source.path));
		default: throw new Error(`media_asset_save: unsupported source kind ${String(source.kind)}`);
	}
}
/** Extract a public https URL from a reference value, if present. */
function extractPublicUrl(reference) {
	const value = /!\[[^\]]*\]\(([^)]+)\)/.exec(reference)?.[1] ?? reference;
	return /^https:\/\//i.test(value) ? value : void 0;
}
/** Append one line to the project asset index (writes the header on first use). */
async function appendIndex(assetsDir, entry) {
	const indexPath = join(assetsDir, "assets-index.md");
	const header = "| 类别 | 资产名 | 路径 | 原始URL | 时间 |\n|------|--------|------|--------|------|\n";
	let content = "";
	try {
		content = await readFile(indexPath, "utf8");
	} catch {
		content = "";
	}
	if (!content.trim()) await appendFile(indexPath, header);
	const url = entry.url ?? "";
	await appendFile(indexPath, `| ${entry.category} | ${entry.name}.${entry.mediaType} | \`${entry.path}\` | ${url !== "" ? `\`${url}\`` : "-"} | ${new Date(entry.ts).toISOString()} |\n`);
}
//#endregion
//#region lib/types/tools/generate-image.js
/**
* `generate_image` tool: text-to-image / reference-image edit via a configured
* media provider, run as a `ctx.jobs` background task. Image generation takes
* tens of seconds to minutes (Maizi's synchronous endpoint blocks until the
* server has generated the image), so the foreground `execute` only starts the
* job and returns the id — it never blocks on the provider call. The model
* reads the full result (attachment reference + 24h result URL) through
* `job_output`; no completion message is pushed into the session, which would
* otherwise pile up as queued messages and force extra model turns.
*
* @module @roubaai/media/tools/generate-image
*/
const name$6 = "generate_image";
function registerGenerateImage(ctx) {
	const disposers = [];
	disposers.push(ctx.tools.register(defineTool({
		name: name$6,
		description: "Generate an image (text-to-image or reference-image edit; default model gpt-image-2). Background job: returns a job id; read the completed result via job_output (1-3 min). The finished image is displayed automatically in the conversation as this job_output tool-result card — do NOT call read_image on a generated image and do NOT paste its URL / path / JSON / Markdown into your reply to \"show\" it. Persist with media_asset_save (reference = the job_output JSON or its resultUrl) when the asset must outlive the 24h URL expiry. For reference edits pass refImages (public https URLs only, max 9). COST per image: gpt-image-2 $0.009/1K, $0.029/2K, $0.044/4K; prefer 1K.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Image prompt"
			},
			refImages: {
				type: "array",
				items: { type: "string" },
				description: "Reference image URLs (public https only, max 9) — an earlier generated image media URL or an attachment URL. Never base64 or local paths."
			},
			aspectRatio: {
				type: "string",
				enum: [
					"1:1",
					"16:9",
					"9:16",
					"4:3",
					"3:4"
				],
				description: "1:1 (default) | 16:9 | 9:16 | 4:3 | 3:4."
			},
			resolution: {
				type: "string",
				enum: [
					"1K",
					"2K",
					"4K"
				],
				description: "1K (default, cheapest) | 2K | 4K."
			},
			quality: {
				type: "string",
				enum: [
					"low",
					"medium",
					"high"
				],
				description: "low (default) | medium | high."
			},
			project: {
				type: "string",
				description: "成本记账用：当前项目名（如 奇幻超人），用于媒体成本账归档；不传则归到工作空间。"
			},
			label: {
				type: "string",
				description: "成本记账用：本资产标识（如 EP01_镜02_镇民躲藏）；同一 (project,label) 第二次出现自动记为重试。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "background"
					},
					jobId: {
						type: "string",
						required: true
					},
					taskId: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Started background image job ${value.jobId}; read the result via job_output when it completes`
			}]
		},
		async execute(args, exec) {
			if (args.prompt.trim().length === 0) throw new Error("generate_image: prompt must be a non-empty string");
			const adapter = readActiveAdapter(ctx, "image");
			const provider = adapter === void 0 ? ctx.media.image() : ctx.media.image(adapter);
			const input = {
				prompt: args.prompt,
				...args.refImages !== void 0 ? { refImages: args.refImages } : {},
				...args.aspectRatio !== void 0 ? { aspectRatio: args.aspectRatio } : {},
				...args.resolution !== void 0 ? { resolution: args.resolution } : {},
				...args.quality !== void 0 ? { quality: args.quality } : {}
			};
			return {
				kind: "background",
				jobId: ctx.jobs.start({
					kind: "media-image",
					label: `generate_image:${provider.provider}`,
					...exec.agent !== void 0 ? { owner: exec.agent } : {},
					run: () => {
						const ac = new AbortController();
						return {
							cancel: (reason) => {
								ac.abort(reason);
							},
							done: (async () => {
								try {
									const result = await provider.generate(input, ac.signal);
									try {
										const workspace = workspaceOf(exec.agent);
										const model = result.providerMeta?.model ?? provider.defaultModel;
										const costUsd = provider.estimateCostUsd(model, args.resolution ?? "1K");
										await appendMediaCost(workspace, {
											ts: Date.now(),
											tool: "image",
											model,
											project: args.project ?? workspace,
											...args.label !== void 0 ? { label: args.label } : {},
											spec: args.resolution ?? "1K",
											costUsd: costUsd ?? 0,
											source: "estimated",
											taskId: provider.provider
										});
									} catch (costError) {
										ctx.logger.warn(`media cost ledger append failed: ${String(costError)}`);
									}
									return {
										status: "completed",
										output: JSON.stringify(result)
									};
								} catch (error) {
									if (ac.signal.aborted) return { status: "killed" };
									return {
										status: "failed",
										detail: error instanceof Error ? error.message : String(error)
									};
								}
							})()
						};
					}
				}),
				taskId: provider.provider
			};
		},
		presentCall(args) {
			return {
				card: "generic",
				title: "Generate image",
				kind: "execute",
				rawInput: args.prompt
			};
		}
	})));
	disposers.push(ctx.tools.guard((execution) => {
		if (execution.name !== "generate_image") return void 0;
		try {
			const adapter = readActiveAdapter(ctx, "image");
			if (adapter === void 0) ctx.media.image();
			else ctx.media.image(adapter);
		} catch (error) {
			if (error?.code === "NO_PROVIDER") return "no image provider is configured";
		}
	}));
	return () => {
		for (const dispose of disposers) dispose();
	};
}
//#endregion
//#region lib/types/tools/generate-video.js
/**
* `generate_video` tool: text-to-video / image-to-video via a configured media
* provider, run as a `ctx.jobs` background task (video generation takes 1-5
* minutes and must not block the foreground `execute`).
*
* The foreground call only submits the task and publishes the job id; the
* background `run()` owns a self-built `AbortController` and polls the
* provider handle until a terminal state, reporting `completed`/`killed`/
* `failed` through `JobHooks.done`. Billing-sensitive: `videoUrls` stack
* reference-video billing, `generateAudio`/`returnLastFrame` add extra output
* — all are capped here and surfaced through the guard.
*
* @module @roubaai/media/tools/generate-video
*/
const name$5 = "generate_video";
/** Poll interval between provider polls inside the background task. */
const POLL_INTERVAL_MS$1 = 1e4;
/** One-line error message for a thrown value (the job detail is model-readable). */
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Render `（HTTP xxx）` when the error carries an HTTP status (provider errors do). */
function errorStatusTag(error) {
	const status = error?.status;
	return typeof status === "number" && Number.isInteger(status) ? `（HTTP ${status}）` : "";
}
/**
* End-to-end polling bound for a video task. Unlike image generation (which
* has a provider-side `pollTimeoutMs`), video generation can take several
* minutes and Maizi may leave a task `running` indefinitely on a server-side
* stall. Without a bound the background job would poll forever and stay
* `running` with no way out except a manual kill. 15 minutes covers normal
* generation plus queue spikes; on expiry the job reports `failed` (retryable)
* rather than hanging.
*/
const VIDEO_POLL_TIMEOUT_MS = 9e5;
/** The default duration when the model omits one (Maizi default is 5). */
const DEFAULT_DURATION = 5;
/** A `sleep` helper for the polling loop. */
function sleep$1(ms, signal) {
	return new Promise((resolve) => {
		if (signal === void 0) {
			setTimeout(resolve, ms);
			return;
		}
		if (signal.aborted) {
			resolve();
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Validate value constraints the schema DSL does not express: the caps the
* provider declares for the model being asked for, and the mutually exclusive
* input combinations. The caps are billing guards — the model cannot inflate
* the cost tier through an omitted or oversized field.
*/
function validateVideoArgs(args, model, caps) {
	if (args.prompt.trim().length === 0) throw new Error("generate_video: prompt must be a non-empty string");
	if (args.imageUrls !== void 0 && args.imageWithRoles !== void 0) throw new Error("generate_video: imageUrls and imageWithRoles are mutually exclusive");
	if (args.imageWithRoles !== void 0 && (args.videoUrls !== void 0 || args.audioUrls !== void 0)) throw new Error("generate_video: imageWithRoles cannot be combined with videoUrls or audioUrls");
	if (args.duration !== void 0 && (!Number.isInteger(args.duration) || args.duration < caps.minDuration || args.duration > caps.maxDuration)) throw new Error(`generate_video: duration must be an integer from ${caps.minDuration} through ${caps.maxDuration}`);
	if (args.imageUrls !== void 0 && args.imageUrls.length > caps.maxImageUrls) throw new Error(`generate_video: at most ${caps.maxImageUrls} reference images are allowed (model ${model ?? "default"})`);
	if (args.videoUrls !== void 0 && args.videoUrls.length > caps.maxVideoUrls) throw new Error(`generate_video: at most ${caps.maxVideoUrls} reference videos are allowed (model ${model ?? "default"})`);
	if (args.audioUrls !== void 0 && args.audioUrls.length > caps.maxAudioUrls) throw new Error(`generate_video: at most ${caps.maxAudioUrls} reference audio files are allowed (model ${model ?? "default"})`);
}
/**
* Register the `generate_video` tool. `ctx.jobs.start` is synchronous and
* returns a `JobId`; `run()` is synchronous and returns `{ cancel, done }`.
* The background loop owns its own `AbortController`, decoupled from
* `exec.signal` once the job id is published (per the background-job contract).
*/
function registerGenerateVideo(ctx) {
	const disposers = [];
	disposers.push(ctx.tools.register(defineTool({
		name: name$5,
		description: "Generate a short video (text-to-video / image-to-video / video_edit). Background job: returns a job id; read the completed result via job_output. The finished video is displayed automatically in the conversation as this job_output tool-result card (inline player) — do NOT paste its URL / JSON into your reply to \"show\" it, and never call read_image on a generated video. Persist with media_asset_save (reference = the job_output JSON or mediaRef.url) when the file must outlive the 24h URL expiry. Pass reference images via imageUrls (public https only). Caps come from the adapter serving the model (Maizi: 2.0 系 = 4-15s / 9 images / 3 videos / 3 audio; 2.5 = 4-30s / 30 / 10 / 10 + video_edit (size=adaptive) + outputFormat). COST per second (Maizi): 2.0-fast $0.0637 (480p) / $0.137 (720p); 2.0 standard $0.0792 / $0.1704; 2.5 $0.1201 / $0.27 (含视频输入更便宜 $0.072/$0.162). Prefer 480p and 4-5s to control cost; videoUrls stacks reference billing; generateAudio adds audio output.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Video prompt (1-4000 characters)."
			},
			model: {
				type: "string",
				required: true,
				description: "模型档位（必填）。取值随当前适配器：麦子科技用 doubao-seedance-2.0-mini / -fast / doubao-seedance-2.0 / doubao-seedance-2.5；火山方舟直连用方舟自己的 Model ID（如 doubao-seedance-1-5-pro-251215）。填错时由适配器报错并列出可用模型。"
			},
			imageUrls: {
				type: "array",
				items: { type: "string" },
				description: "Optional reference image URLs (max 30; Seedance 2.0 上限 9). 与 imageWithRoles 互斥。"
			},
			imageWithRoles: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: true
				},
				description: "Role-tagged images (首帧/尾帧/参考图, 如 [{ role: \"first_frame\", image_url: \"...\" }]). 与 imageUrls 互斥; 使用后不可再用 videoUrls/audioUrls。"
			},
			videoUrls: {
				type: "array",
				items: { type: "string" },
				description: "Optional reference video URLs (max 10; Seedance 2.0 上限 3; stacks reference billing)."
			},
			audioUrls: {
				type: "array",
				items: { type: "string" },
				description: "Optional reference audio URLs (max 10; Seedance 2.5 能力)."
			},
			duration: {
				type: "integer",
				description: "Duration in seconds, 4-30, default 5 (Seedance 2.0 上限 15; 2.5 上限 30). Shorter costs less."
			},
			size: {
				type: "string",
				enum: [
					"16:9",
					"9:16",
					"1:1",
					"4:3",
					"3:4",
					"21:9",
					"adaptive"
				],
				description: "Aspect ratio; adaptive 仅用于 video_edit."
			},
			resolution: {
				type: "string",
				enum: [
					"480p",
					"720p",
					"1080p"
				],
				description: "Resolution, default 720p. 480p is roughly half the 720p cost."
			},
			generateAudio: {
				type: "boolean",
				description: "Generate an audio-carrying video (extra cost), default false."
			},
			returnLastFrame: {
				type: "boolean",
				description: "Return the last frame for continuous video (extra output), default false."
			},
			generationType: {
				type: "string",
				enum: ["reference", "video_edit"],
				description: "Generation mode: reference (default) | video_edit (Seedance 2.5 视频编辑, 需 videoUrls + size=adaptive)."
			},
			outputFormat: {
				type: "string",
				enum: ["mp4", "mov"],
				description: "Output container, default mp4 (Seedance 2.5)."
			},
			callbackUrl: {
				type: "string",
				description: "Task-terminal callback URL (生成完成后 POST 通知)."
			},
			watermark: {
				type: "boolean",
				description: "Add watermark, default false."
			},
			project: {
				type: "string",
				description: "成本记账用：当前项目名（如 奇幻超人），用于媒体成本账归档；不传则归到工作空间。"
			},
			label: {
				type: "string",
				description: "成本记账用：本镜头标识（如 EP01_镜02_镇民躲藏）；同一 (project,label) 第二次出现自动记为重试。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "background"
					},
					jobId: {
						type: "string",
						required: true
					},
					taskId: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Started background video job ${value.jobId} (task ${value.taskId})`
			}]
		},
		async execute(args, exec) {
			const adapter = readActiveAdapter(ctx, "video");
			const provider = adapter === void 0 ? ctx.media.video() : ctx.media.video(adapter);
			const effectiveModel = args.model;
			validateVideoArgs(args, effectiveModel, provider.caps(effectiveModel));
			const input = {
				prompt: args.prompt,
				model: args.model,
				...args.imageUrls !== void 0 ? { imageUrls: args.imageUrls } : {},
				...args.imageWithRoles !== void 0 ? { imageWithRoles: args.imageWithRoles } : {},
				...args.videoUrls !== void 0 ? { videoUrls: args.videoUrls } : {},
				...args.audioUrls !== void 0 ? { audioUrls: args.audioUrls } : {},
				duration: args.duration ?? DEFAULT_DURATION,
				...args.size !== void 0 ? { size: args.size } : {},
				...args.resolution !== void 0 ? { resolution: args.resolution } : {},
				...args.generateAudio !== void 0 ? { generateAudio: args.generateAudio } : {},
				...args.returnLastFrame !== void 0 ? { returnLastFrame: args.returnLastFrame } : {},
				...args.generationType !== void 0 ? { generationType: args.generationType } : {},
				...args.outputFormat !== void 0 ? { outputFormat: args.outputFormat } : {},
				...args.callbackUrl !== void 0 ? { callbackUrl: args.callbackUrl } : {},
				...args.watermark !== void 0 ? { watermark: args.watermark } : {}
			};
			const handle = await provider.submit(input, exec.signal);
			return {
				kind: "background",
				jobId: ctx.jobs.start({
					kind: "media-video",
					label: `generate_video:${handle.taskId}`,
					...exec.agent !== void 0 ? { owner: exec.agent } : {},
					run: () => {
						const ac = new AbortController();
						const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
						return {
							cancel: (reason) => {
								ac.abort(reason);
							},
							done: (async () => {
								for (;;) {
									if (ac.signal.aborted) return { status: "killed" };
									if (Date.now() > deadline) return {
										status: "failed",
										detail: `video generation timed out after ${VIDEO_POLL_TIMEOUT_MS / 1e3}s`
									};
									let poll;
									try {
										poll = await handle.poll(ac.signal);
									} catch (error) {
										return {
											status: "failed",
											detail: `轮询网络失败：生成任务可能仍在后台运行，仅轮询中断；可重试轮询（${errorMessage(error)}）`
										};
									}
									if (poll.status === "succeeded") {
										let result;
										try {
											result = await provider.finalize(handle, ac.signal);
										} catch (error) {
											return {
												status: "failed",
												detail: `结果下载失败${errorStatusTag(error)}：视频已生成成功，拉取结果失败，可重试拉取（${errorMessage(error)}）`
											};
										}
										try {
											const workspace = workspaceOf(exec.agent);
											const reported = result.providerMeta?.costUsd;
											const reportedUsd = typeof reported === "number" && Number.isFinite(reported) ? reported : void 0;
											const estimated = provider.estimateCostUsd(result.providerMeta?.model ?? provider.defaultModel, input.duration ?? DEFAULT_DURATION, args.resolution ?? "720p");
											await appendMediaCost(workspace, {
												ts: Date.now(),
												tool: "video",
												model: result.providerMeta?.model ?? provider.defaultModel,
												project: args.project ?? workspace,
												...args.label !== void 0 ? { label: args.label } : {},
												spec: `${input.duration ?? DEFAULT_DURATION}s×${args.resolution ?? "720p"}`,
												costUsd: reportedUsd ?? estimated ?? 0,
												source: reportedUsd !== void 0 ? "reported" : "estimated",
												..."taskId" in handle ? { taskId: handle.taskId } : {}
											});
										} catch (costError) {
											ctx.logger.warn(`media cost ledger append failed: ${String(costError)}`);
										}
										const localUrl = await downloadToCache({
											url: result.mediaRef.url,
											mediaType: result.mediaRef.mediaType,
											fallbackExt: "mp4",
											log: (message) => ctx.logger.warn(`[media-cache] ${message}`)
										});
										if (localUrl !== void 0) result = {
											...result,
											mediaRef: {
												...result.mediaRef,
												localUrl
											}
										};
										return {
											status: "completed",
											output: JSON.stringify(result)
										};
									}
									if (poll.status === "failed") return {
										status: "failed",
										detail: `video generation FAILED: ${poll.errorMsg ?? "unknown reason"} — 生成失败（可能已产生费用）；请用户确认后再决定是否重新生成`
									};
									await sleep$1(POLL_INTERVAL_MS$1, ac.signal);
								}
							})()
						};
					}
				}),
				taskId: handle.taskId
			};
		}
	})));
	disposers.push(ctx.tools.guard((execution) => {
		if (execution.name !== "generate_video") return void 0;
		try {
			const adapter = readActiveAdapter(ctx, "video");
			if (adapter === void 0) ctx.media.video();
			else ctx.media.video(adapter);
		} catch (error) {
			if (error?.code === "NO_PROVIDER") return "no video provider is configured";
		}
	}));
	return () => {
		for (const dispose of disposers) dispose();
	};
}
//#endregion
//#region lib/types/tools/generate-music.js
/**
* `generate_music` tool: BGM / song generation via a configured music
* provider (Suno-style: inspiration or custom lyrics mode), run as a
* `ctx.jobs` background task — music generation takes 1-3 minutes and must
* not block the foreground `execute`.
*
* One generation request yields **2 candidate tasks** (Suno convention). The
* background loop polls all of them and resolves as soon as the FIRST one
* completes (BGM workflows need one usable track, not both); the result
* carries every task's terminal state so the model can see the skipped
* sibling. The model reads the result through `job_output` — no completion
* message is pushed into the session (queued-message tray discipline).
*
* The result's `audioUrl` is a 24h provider URL: persist it with
* `media_asset_save` (reference = the URL) to survive expiry.
*
* @module @roubaai/media/tools/generate-music
*/
const name$4 = "generate_music";
/** Poll interval between provider polls inside the background task. */
const POLL_INTERVAL_MS = 1e4;
/**
* End-to-end polling bound for a music generation. Music typically completes
* in 1-3 minutes; 10 minutes covers queue spikes. On expiry the job reports
* a retryable `failed` rather than hanging.
*/
const MUSIC_POLL_TIMEOUT_MS = 6e5;
/** A `sleep` helper for the polling loop. */
function sleep(ms, signal) {
	return new Promise((resolve) => {
		if (signal === void 0) {
			setTimeout(resolve, ms);
			return;
		}
		if (signal.aborted) {
			resolve();
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Validate cross-field constraints the schema DSL cannot express: exactly one
* of description/lyrics, and the 0-1 slider ranges.
*/
function validateMusicArgs(args) {
	if ((args.description === void 0 || args.description.trim().length === 0) && (args.lyrics === void 0 || args.lyrics.trim().length === 0)) throw new Error("generate_music: provide either description (灵感模式) or lyrics (自定义模式)");
	for (const [field, value] of [["styleWeight", args.styleWeight], ["weirdnessConstraint", args.weirdnessConstraint]]) if (value !== void 0 && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error(`generate_music: ${field} must be a number between 0 and 1`);
}
/**
* Register the `generate_music` tool. `ctx.jobs.start` is synchronous and
* returns a `JobId`; `run()` is synchronous and returns `{ cancel, done }`.
*/
function registerGenerateMusic(ctx) {
	const disposers = [];
	disposers.push(ctx.tools.register(defineTool({
		name: name$4,
		description: "Generate background music / a song (Suno-style). **本次调用会启动 2 个并行后台任务（不是 1 个）**：Suno 每次生成 2 首候选，每个候选一个独立 DSH job——返回值里 **jobs 数组才是完整列表（2 个 jobId）**，顶层 jobId/taskId 只是第 1 个候选的快捷字段。两首独立完成、独立轮询：哪首先完成就先 job_output {wait:true} 读哪首，**不要等另一首**；两首都到手后挑更好的用 media_asset_save 落盘（24h audio URL），另一首无视即可。Two modes: 灵感模式 pass description OR 自定义模式 pass lyrics + tags. **description 必须是完整的一段式公式，缺一项即为劣质提示词**：\"[情绪形容词] [曲风] instrumental for [场景], featuring [主乐器] and [辅乐器], [BPM] tempo, [动态走向], [X-bar 结构按目标时长换算: ≤10s→4-bar sting / 10-30s→8-16 bar loop / 30-60s→16-24 bar A-B / 60-90s→32-bar A-B-A' / 更长→48-64 bar 多段], in [调性], evoking [预期感受].\" 例: \"Warm and tender ambient instrumental for a healing animation, featuring soft piano and gentle strings, 70 BPM, gentle dynamics, 32-bar A-B-A' structure with peak at bar 20, in F major, evoking peace and comfort.\" BGM for videos: instrumental=true (no vocals), 结构小节数按成片累计时长换算. COST: points-based per generation. 播放展示：完成的候选在读 job_output 时会自动显示在对话中的工具结果卡（内嵌播放器）——**不要**再把 audioUrl 用 Markdown 贴进回复，也不要贴整段 JSON；封面会作为封面展示。",
		parameters: {
			description: {
				type: "string",
				description: "灵感模式：音乐描述（风格/情绪/场景，如 \"轻快的管弦乐，温暖，适合小镇黄昏场景\"）。与 lyrics 二选一。"
			},
			lyrics: {
				type: "string",
				description: "自定义模式：完整歌词。与 description 二选一；用 instrumental 代替无歌词需求。"
			},
			tags: {
				type: "string",
				description: "自定义模式：音乐风格标签（如 \"pop, rock, cinematic\"）。"
			},
			negativeTags: {
				type: "string",
				description: "排除的风格（如 \"heavy drums\"）。"
			},
			title: {
				type: "string",
				description: "歌名。"
			},
			instrumental: {
				type: "boolean",
				description: "纯音乐（无人声）。BGM 场景建议 true；缺省 false（人声歌）。"
			},
			vocalGender: {
				type: "string",
				enum: ["m", "f"],
				description: "人声性别（无人声时忽略）。"
			},
			styleWeight: {
				type: "number",
				description: "风格参考度 0-1。"
			},
			weirdnessConstraint: {
				type: "number",
				description: "怪异约束度 0-1。"
			},
			model: {
				type: "string",
				description: "模型版本覆盖（chirp-bluejay 推荐 / chirp-v4 / chirp-crow 等）；缺省用 provider 默认。"
			},
			project: {
				type: "string",
				description: "成本记账用：当前项目名（如 奇幻超人），用于媒体成本账归档；不传则归到工作空间。"
			},
			label: {
				type: "string",
				description: "成本记账用：本资产标识（如 EP01_BGM_轻快）；同一 (project,label) 第二次出现自动记为重试。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "background"
					},
					jobId: {
						type: "string",
						required: true,
						description: "First candidate job id (= jobs[0].jobId)."
					},
					taskId: {
						type: "string",
						required: true,
						description: "First candidate task id."
					},
					jobs: {
						type: "array",
						required: true,
						description: "每候选任务一个独立 job（通常 2 个）——各自独立完成，用 job_output 分别读取，先完成先拿。",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								jobId: {
									type: "string",
									required: true
								},
								taskId: {
									type: "string",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Started ${value.jobs.length} parallel background music jobs (${value.jobs.map((j) => j.jobId).join(", ")}) — one per candidate track; read each via job_output, first finished first`
			}]
		},
		async execute(args, exec) {
			validateMusicArgs(args);
			const adapter = readActiveAdapter(ctx, "music");
			const provider = adapter === void 0 ? ctx.media.music() : ctx.media.music(adapter);
			const input = {
				...args.description !== void 0 ? { description: args.description } : {},
				...args.lyrics !== void 0 ? { lyrics: args.lyrics } : {},
				...args.tags !== void 0 ? { tags: args.tags } : {},
				...args.negativeTags !== void 0 ? { negativeTags: args.negativeTags } : {},
				...args.title !== void 0 ? { title: args.title } : {},
				...args.instrumental !== void 0 ? { instrumental: args.instrumental } : {},
				...args.vocalGender !== void 0 ? { vocalGender: args.vocalGender } : {},
				...args.styleWeight !== void 0 ? { styleWeight: args.styleWeight } : {},
				...args.weirdnessConstraint !== void 0 ? { weirdnessConstraint: args.weirdnessConstraint } : {},
				...args.model !== void 0 ? { model: args.model } : {}
			};
			const started = (await provider.submit(input, exec.signal)).map((handle) => {
				return {
					jobId: ctx.jobs.start({
						kind: "media-music",
						label: `generate_music:${handle.taskId}`,
						...exec.agent !== void 0 ? { owner: exec.agent } : {},
						run: () => {
							const ac = new AbortController();
							const deadline = Date.now() + MUSIC_POLL_TIMEOUT_MS;
							return {
								cancel: (reason) => {
									ac.abort(reason);
								},
								done: (async () => {
									for (;;) {
										if (ac.signal.aborted) return { status: "killed" };
										if (Date.now() > deadline) return {
											status: "failed",
											detail: `music generation timed out after ${MUSIC_POLL_TIMEOUT_MS / 1e3}s`
										};
										let poll;
										try {
											poll = await handle.poll(ac.signal);
										} catch (error) {
											if (ac.signal.aborted) return { status: "killed" };
											return {
												status: "failed",
												detail: error instanceof Error ? error.message : String(error)
											};
										}
										if (poll.status === "succeeded") {
											let track;
											try {
												track = await provider.fetchTrack(handle.taskId, ac.signal);
											} catch (error) {
												if (ac.signal.aborted) return { status: "killed" };
												return {
													status: "failed",
													detail: error instanceof Error ? error.message : String(error)
												};
											}
											const localUrl = await downloadToCache({
												url: track.audioUrl,
												mediaType: "audio/mpeg",
												fallbackExt: "mp3",
												log: (message) => ctx.logger.warn(`[media-cache] ${message}`)
											});
											if (localUrl !== void 0) track = {
												...track,
												localUrl
											};
											const result = {
												kind: "music",
												mediaType: "audio/mpeg",
												track,
												tracks: [track],
												tasks: [{
													taskId: handle.taskId,
													status: "completed"
												}],
												providerMeta: {
													provider: provider.provider,
													model: args.model ?? provider.defaultModel
												}
											};
											try {
												const workspace = workspaceOf(exec.agent);
												await appendMediaCost(workspace, {
													ts: Date.now(),
													tool: "music",
													model: args.model ?? provider.defaultModel,
													project: args.project ?? workspace,
													...args.label !== void 0 ? { label: args.label } : {},
													spec: track.durationSeconds !== void 0 ? `${Math.round(track.durationSeconds)}s` : "music",
													costUsd: 0,
													source: "estimated",
													taskId: handle.taskId
												});
											} catch (costError) {
												ctx.logger.warn(`media cost ledger append failed: ${String(costError)}`);
											}
											return {
												status: "completed",
												output: JSON.stringify(result)
											};
										}
										if (poll.status === "failed") return {
											status: "failed",
											detail: poll.errorMsg ?? "music generation failed"
										};
										await sleep(POLL_INTERVAL_MS, ac.signal);
									}
								})()
							};
						}
					}),
					taskId: handle.taskId
				};
			});
			return {
				kind: "background",
				jobId: started[0]?.jobId ?? "",
				taskId: started[0]?.taskId ?? "",
				jobs: started
			};
		},
		presentCall(args) {
			return {
				card: "generic",
				title: "Generate music",
				kind: "execute",
				rawInput: args.title ?? args.description ?? args.tags ?? args.lyrics ?? ""
			};
		}
	})));
	disposers.push(ctx.tools.guard((execution) => {
		if (execution.name !== "generate_music") return void 0;
		try {
			const adapter = readActiveAdapter(ctx, "music");
			if (adapter === void 0) ctx.media.music();
			else ctx.media.music(adapter);
		} catch (error) {
			if (error?.code === "NO_PROVIDER") return "no music provider is configured";
		}
	}));
	return () => {
		for (const dispose of disposers) dispose();
	};
}
//#endregion
//#region lib/types/tools/media-reference-url.js
/**
* `media_reference_url` tool: turn a reference image that the media provider
* cannot reach (a local file path, a host-local `/api/...` URL, or any value
* that is not a public https URL) into a public https URL the provider can
* fetch as a `refImages` / `imageUrls` entry.
*
* The model decides when to call this: when it wants to use a reference image
* (an uploaded attachment, a local path, or an earlier generated image whose
* URL is host-local) but the generation tool requires a reachable public URL,
* it first calls this tool to obtain the public URL, then passes that URL into
* `generate_image` / `generate_video`.
*
* @module @roubaai/media/tools/media-reference-url
*/
const name$3 = "media_reference_url";
/** Extract the target URL from a Markdown image reference like `![alt](url)`. */
function extractMarkdownUrl(value) {
	return /!\[[^\]]*\]\(([^)]+)\)/.exec(value)?.[1];
}
function registerMediaReferenceUrl(ctx) {
	return ctx.tools.register(defineTool({
		name: name$3,
		description: "Publish reference images as public https URLs for generate_image (refImages) / generate_video (imageUrls), which only accept public https. Call before using an attachment, host-local image, or local file as a reference. Pass each reference verbatim (Markdown image, bare /... URL, or local path); already-public https URLs pass through unchanged. Returns one URL per input, same order.",
		parameters: { references: {
			type: "array",
			items: { type: "string" },
			description: "Reference images to publish (max 9). Each: verbatim Markdown image from context, bare host URL (/describe-image/raw/...), local path, or already-public https URL (returned unchanged)."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { urls: {
					type: "array",
					items: { type: "string" },
					required: true,
					description: "Public https URL for each input reference, in the same order."
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: [
					`Published ${(value.urls ?? []).length} reference URL(s):`,
					...(value.urls ?? []).map((url, i) => `${i + 1}. ${url}`),
					"Use these public URLs in `generate_image` (refImages) / `generate_video` (imageUrls)."
				].join("\n")
			}]
		},
		async execute(args, exec) {
			const workspaceRoot = exec.agent?.session?.header?.cwd;
			return { urls: await Promise.all((args.references ?? []).map(async (raw) => {
				const ref = extractMarkdownUrl(raw) ?? raw;
				return ctx.mediaUrl.normalize(ref, workspaceRoot);
			})) };
		},
		presentCall(args) {
			return {
				card: "generic",
				title: "Publish reference image URL",
				kind: "execute",
				rawInput: (args.references ?? []).join(", ")
			};
		}
	}));
}
//#endregion
//#region lib/types/tools/extract-frame.js
/**
* `media_extract_frame` tool: extract still frames from a video (any time or
* a uniform spread) and land them into the project asset library, so a clip
* can be continued/referenced later (续拍 / 关键帧参考). Uses ffmpeg/ffprobe
* from PATH (the DSH host is expected to provide them; see FFMPEG_* env or
* plain `ffmpeg`). Reuses `media_asset_save`'s reference resolution + index
* append so extracted frames behave exactly like any other asset.
*
* @module @roubaai/media/tools/extract-frame
*/
const name$2 = "media_extract_frame";
/** Allowed asset categories (mirrors media_asset_save). 默认推荐 keyframe——抽帧是从视频派生的参考帧，独立分类最清晰。 */
const CATEGORIES = [
	"upload",
	"character",
	"scene",
	"prop",
	"keyframe",
	"storyboard",
	"cover"
];
/** Maximum frames per call (billing/size guard for uniform extraction). */
const MAX_COUNT = 8;
const ffmpegBin = () => process.env.FFMPEG_BIN ?? "ffmpeg";
const ffprobeBin = () => process.env.FFPROBE_BIN ?? "ffprobe";
/** 视频参考不支持图片 attachment（attachment 是 ImageAttachmentRef）；返回可给 ffmpeg 的输入或 undefined。 */
function toFfmpegInput(source) {
	if (source.kind === "local") return source.path;
	if (source.kind === "url") return source.url;
}
/** Probe video duration (seconds) via ffprobe. */
function probeDuration(input) {
	const res = spawnSync(ffprobeBin(), [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		input
	], {
		timeout: 3e4,
		encoding: "utf8"
	});
	if (res.status !== 0) return void 0;
	const v = parseFloat((res.stdout ?? "").trim());
	return Number.isFinite(v) ? v : void 0;
}
function registerExtractFrame(ctx) {
	const disposers = [];
	disposers.push(ctx.tools.register(defineTool({
		name: name$2,
		description: "Extract still frames from a video (specific time or uniform spread) and land them into the asset library (same category layout as media_asset_save; recommended category keyframe). Use for 续拍/连续视频 (tail frame of one episode as the next episode opening reference), action keyframes, pose references, scene moments. Requires ffmpeg/ffprobe on PATH (or FFMPEG_BIN/FFPROBE_BIN). Background job: returns a job id.",
		parameters: {
			reference: {
				type: "string",
				required: true,
				description: "The video to extract from. Accepts a Markdown image/video reference, a host URL (/describe-image/raw/... or /api/media.stream/...), a public https URL, a local file path, or a sha256 id."
			},
			project: {
				type: "string",
				required: true,
				description: "Project folder name; frames land under <workspace>/.assets/<project>/<category>/."
			},
			category: {
				type: "string",
				enum: [...CATEGORIES],
				required: true,
				description: "Asset category. 推荐 keyframe = 从视频抽出的参考帧（续拍/姿态/场景时刻）；按内容归入 character/scene/prop 也可."
			},
			name: {
				type: "string",
				required: true,
				description: "File base name without extension. May include `/` sub-paths (e.g. 小美/姿态/拔剑). Multi-frame extraction appends _1, _2…"
			},
			time: {
				type: "number",
				description: "Extract the frame at this second (e.g. 3.5). Mutually exclusive with count; default extracts the middle frame (50%)."
			},
			count: {
				type: "integer",
				description: `Extract ${MAX_COUNT} uniformly spread frames (e.g. count=3 → 25%/50%/75%). Mutually exclusive with time.`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "background"
					},
					jobId: {
						type: "string",
						required: true
					},
					frames: {
						type: "array",
						items: { type: "string" },
						required: true,
						description: "Planned frame paths."
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Started background frame-extraction job ${value.jobId}; ${value.frames.length} frame(s): ${value.frames.join(", ")}`
			}]
		},
		async execute(args, exec) {
			const source = resolveSource(args.reference);
			if (source === void 0) throw new Error("media_extract_frame: could not resolve the video reference");
			const input = toFfmpegInput(source);
			if (input === void 0) throw new Error("media_extract_frame: video reference must be a URL, host URL, local path, or sha256 id (attachment references are images)");
			if (args.time !== void 0 && args.count !== void 0) throw new Error("media_extract_frame: time and count are mutually exclusive");
			if (args.count !== void 0 && (args.count < 1 || args.count > MAX_COUNT)) throw new Error(`media_extract_frame: count must be 1-${MAX_COUNT}`);
			if (/\.\./.test(args.name) || /^[a-zA-Z]:[\\/]/.test(args.name) || args.name.startsWith("/")) throw new Error("media_extract_frame: name must be a relative sub-path without `..` or drive letters");
			const safeName = args.name.replace(/[\\:*?"<>|]/g, "_");
			const count = args.count;
			const projectDir = join(workspaceOf(exec.agent), ".assets", args.project);
			const category = args.category;
			const plan = await (async () => {
				if (args.time !== void 0) return [args.time];
				const dur = probeDuration(input);
				const base = dur !== void 0 && dur > 0 ? dur : 5;
				if (count !== void 0) return Array.from({ length: count }, (_, i) => Math.min(base * (i + .5) / count, Math.max(0, base - .05)));
				return [base / 2];
			})();
			const frames = plan.map((_, i) => join(projectDir, category, plan.length === 1 ? `${safeName}.png` : `${safeName}_${i + 1}.png`));
			return {
				kind: "background",
				jobId: ctx.jobs.start({
					kind: "media-extract-frame",
					label: `media_extract_frame:${category}/${safeName}`,
					...exec.agent !== void 0 ? { owner: exec.agent } : {},
					run: () => {
						const ac = new AbortController();
						return {
							cancel: (reason) => {
								ac.abort(reason);
							},
							done: (async () => {
								const tempDir = join(tmpdir(), `dsh-extract-${randomUUID()}`);
								try {
									for (let i = 0; i < plan.length; i++) {
										if (ac.signal.aborted) return {
											status: "failed",
											detail: "aborted"
										};
										const t = plan[i];
										const out = frames[i];
										await mkdir(dirname(out), { recursive: true });
										const res = spawnSync(ffmpegBin(), [
											"-y",
											"-ss",
											String(t),
											"-i",
											input,
											"-frames:v",
											"1",
											out
										], {
											timeout: 9e4,
											encoding: "utf8"
										});
										if (ac.signal.aborted) return {
											status: "failed",
											detail: "aborted"
										};
										if (res.status !== 0 || res.error !== void 0) return {
											status: "failed",
											detail: `ffmpeg extract failed at ${t}s: ${(res.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" ")}`
										};
										await appendIndex(projectDir, {
											category,
											name: plan.length === 1 ? safeName : `${safeName}_${i + 1}`,
											path: out,
											ref: args.reference,
											url: extractPublicUrl(args.reference),
											ts: Date.now(),
											mediaType: "png"
										});
									}
									return {
										status: "completed",
										output: JSON.stringify({ frames })
									};
								} catch (error) {
									if (ac.signal.aborted) return {
										status: "failed",
										detail: "aborted"
									};
									return {
										status: "failed",
										detail: error instanceof Error ? error.message : String(error)
									};
								} finally {
									rm(tempDir, {
										recursive: true,
										force: true
									});
								}
							})()
						};
					}
				}),
				frames
			};
		},
		presentCall(args) {
			return {
				card: "generic",
				title: `Extract frames ${args.name}`,
				kind: "execute",
				rawInput: `${args.category}/${args.name}`
			};
		}
	})));
	return () => {
		for (const dispose of disposers) dispose();
	};
}
//#endregion
//#region lib/types/tools/media-cost-summary.js
/**
* `media_cost_summary` tool: fold the automatic media cost ledger
* (`<workspace>/.assets/media-cost.jsonl`, written by the generate_* tools on
* every completion) into a model/owner-readable total. Used when the user asks
* about cost, or when the cost-tracker document needs an actual-vs-expected
* refresh — the ledger itself is automatic, so this tool never depends on the
* agent remembering to record anything.
*
* @module @roubaai/media/tools/media-cost-summary
*/
const name$1 = "media_cost_summary";
/** One-line USD renderer. */
function usd(n) {
	return `$${n.toFixed(4)}`;
}
/** Fold the summary into a compact markdown block for the caller. */
function renderSummary(summary, projectLabel) {
	const lines = [];
	lines.push(`媒体成本账（${projectLabel}）：共 ${summary.totalCount} 次生成，合计 ${usd(summary.totalUsd)}，其中重试 ${summary.retryCount} 次 ${usd(summary.retryUsd)}`);
	for (const label of summary.byLabel) lines.push(`- ${label.label}（${label.project}）：首次 ${usd(label.firstUsd)}，重试 ${label.retries} 次，累计 ${usd(label.totalUsd)}`);
	if (summary.byLabel.length === 0) lines.push("-（无带 label 的记录）");
	const tools = summary.byTool.map((t) => `${t.tool}×${t.count}=${usd(t.totalUsd)}`).join(" ｜ ");
	lines.push(`按类型：${tools}`);
	return lines.join("\n");
}
function registerMediaCostSummary(ctx) {
	return ctx.tools.register(defineTool({
		name: name$1,
		description: "Read the automatic media cost ledger (written by generate_image / generate_video / generate_music on every completion) and summarize actual spend, grouped by label (shot/asset) with retry counts. Use when the user asks how much a project/shot cost, or when refreshing the cost-tracker document.",
		parameters: {
			project: {
				type: "string",
				description: "Filter by project name (e.g. 奇幻超人). Default: the whole workspace. Entries recorded without a project fall back to the workspace path."
			},
			since: {
				type: "string",
				description: "Only count records at or after this ISO 8601 time (e.g. 2026-08-31T00:00:00Z). Default: all."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: {
						type: "string",
						required: true
					},
					totalUsd: {
						type: "number",
						required: true
					},
					totalCount: {
						type: "number",
						required: true
					},
					retryCount: {
						type: "number",
						required: true
					},
					retryUsd: {
						type: "number",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}]
		},
		async execute(args, exec) {
			const workspace = workspaceOf(exec.agent);
			let since;
			if (args.since !== void 0) {
				const parsed = Date.parse(args.since);
				if (Number.isNaN(parsed)) throw new Error("media_cost_summary: since must be an ISO 8601 date");
				since = parsed;
			}
			const summary = await summarizeMediaCost(workspace, {
				...args.project !== void 0 ? { project: args.project } : {},
				...since !== void 0 ? { since } : {}
			});
			return {
				text: renderSummary(summary, args.project ?? "全部项目"),
				totalUsd: summary.totalUsd,
				totalCount: summary.totalCount,
				retryCount: summary.retryCount,
				retryUsd: summary.retryUsd
			};
		},
		presentCall(args) {
			return {
				card: "generic",
				title: "Media cost summary",
				kind: "execute",
				rawInput: args.project ?? "workspace"
			};
		}
	}));
}
//#endregion
//#region lib/types/provider.js
/**
* Media generation provider seam: the provider-neutral abstract classes a
* media provider implements. Mirrors autovideo's `base.py`
* `BaseImageGenerator`/`BaseVideoGenerator` in TypeScript, but keeps only the
* cross-provider minimal public contract — provider-specific fields (Maizi's
* `violation`, `queued`, `costUsd`, multi-URL structure, 24h download policy)
* live in the provider implementation layer, never here.
*
* Images return a landed resource reference (never raw base64); video is
* asynchronous, so it is split into `submit` + `finalize` over a pollable
* handle.
*
* @module @roubaai/media/provider
*/
var ImageProvider = class {};
var VideoProvider = class {};
var MusicProvider = class {};
//#endregion
//#region lib/types/index.js
/**
* The media-generation capability family: a provider seam (`ctx.media`) plus
* the `generate_image` / `generate_video` tools. Provider implementations
* (such as `@roubaai/media-maizi`) register themselves with
* `ctx.media.registerImageProvider` / `registerVideoProvider` — registering a
* provider is all that is needed to wire it to the tools, which stay
* provider-agnostic.
*
* @module @roubaai/media
*/
const name = "roubaai-media";
const inject = [
	"tools",
	"jobs",
	"attachments",
	"webServer"
];
function apply(ctx) {
	new MediaRuntimeLocal(ctx);
	new MediaUrlNormalizer(ctx);
	ctx.effect(() => registerWebRoutes(ctx.webServer), "roubaai-media: media stream routes");
	registerGenerateImage(ctx);
	registerGenerateVideo(ctx);
	registerGenerateMusic(ctx);
	registerMediaReferenceUrl(ctx);
	registerMediaAssetSave(ctx);
	registerExtractFrame(ctx);
	registerMediaCostSummary(ctx);
}
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { ImageProvider, MEDIA_SETTINGS_NAMESPACE, MediaRuntimeLocal, MusicProvider, NoProviderError, VideoProvider, apply, types_default as default, inject, name, readActiveAdapter, readActiveMediaProvider };
