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
import { Context, Service } from '@deepseek-ai/cordis';
/**
 * The local reference normalizer service. Registered as `ctx.mediaUrl` for
 * the lifetime of the media apply fiber; started lazily and disposed with it.
 */
export declare class MediaUrlNormalizer extends Service {
    private server;
    private tunnel;
    private baseUrl;
    private starting;
    /** The fixed workspace root that `/_local/...` serves files from. */
    private root;
    constructor(ctx: Context);
    /** Normalize a single reference value into a public https URL the provider can reach. */
    normalize(ref: string, workspaceRoot?: string): Promise<string>;
    /** Normalize an array of reference values in place. */
    normalizeAll(refs: readonly string[], workspaceRoot?: string): Promise<string[]>;
    /**
     * Lazily start the static server + tunnel and return the cached tunnel
     * base URL. Concurrent callers share a single startup promise. The first
     * call pins the workspace root that `/_local/...` serves from.
     */
    private ensureStarted;
    private start;
    private ensureServer;
    private serve;
    /** Spawn cloudflared and wait for the printed tunnel URL. */
    private startTunnel;
    /** Map a local path to the static server's public URL path, relative to the workspace root. */
    private toPublicPath;
    private teardown;
}
export default MediaUrlNormalizer;
//# sourceMappingURL=tunnel.d.ts.map