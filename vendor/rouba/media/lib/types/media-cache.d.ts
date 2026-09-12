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
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Route prefix on the host webserver. */
export declare const MEDIA_ROUTE_PREFIX = "/api/roubaai-media";
/** Register already-local bytes under their source URL (media_asset_save reuse). */
export declare function registerLocalMedia(options: {
    readonly url: string;
    readonly filePath: string;
    readonly mediaType: string;
}): string | undefined;
/** Same-origin signed URL for a source URL this process already cached. */
export declare function lookupCachedMediaUrl(url: string): string | undefined;
/** Local file of a URL this process already cached (media_asset_save reuses it). */
export declare function cachedMediaFile(url: string): string | undefined;
/** Re-read a cached file's bytes (media_asset_save reuse path). */
export declare function cachedMediaBytes(url: string): Promise<Uint8Array | undefined>;
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
export declare function downloadToCache(options: {
    readonly url: string;
    readonly mediaType: string;
    readonly fallbackExt: string;
    readonly log?: (message: string) => void;
}): Promise<string | undefined>;
/**
 * Start a background download of one provider URL into the workspace cache.
 * Does NOT block the caller: the generation job settles immediately and the
 * client polls `lookup` until this finishes, then switches to the local stream.
 * @param options - workspace root, provider URL, media MIME, and diagnostics.
 */
export declare function cacheInBackground(options: {
    readonly workspace: string;
    readonly url: string;
    readonly mediaType: string;
    readonly fallbackExt: string;
    readonly log?: (message: string) => void;
}): void;
/**
 * Register the same-origin media routes on the host webserver:
 * - `<prefix>/media?id=…&exp=…&sig=…` — signed stream of one registered file;
 * - `<prefix>/lookup?url=<cdn>` — JSON `{ mediaUrl }` when the URL is cached,
 *   else `{ mediaUrl: null }` (the client polls this to switch to local).
 * @param webServer - the host webserver service (routes share its origin).
 * @returns the disposer removing the routes.
 */
export declare function registerWebRoutes(webServer: {
    register(route: {
        kind: 'prefix' | 'exact';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
}): () => void;
//# sourceMappingURL=media-cache.d.ts.map