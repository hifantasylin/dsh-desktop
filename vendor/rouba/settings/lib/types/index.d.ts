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
import type { Context } from '@deepseek-ai/cordis';
/**
 * Stable Cordis plugin name. Intentionally NOT the settings namespace: the
 * namespace (`ROUBAAI_SETTINGS_NS`) is the data contract the media providers
 * read, so it stays put even when this package's npm name changes.
 */
export declare const name = "roubaai-settings";
/** Services required before the namespace and its route can be mounted. */
export declare const inject: string[];
/** The JSON API prefix (`POST <prefix>/<method>`). */
export declare const API_PREFIX = "/api/roubaai-video";
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
export declare function testConnection(baseUrl: string, apiKey: string): Promise<{
    ok: boolean;
    message: string;
}>;
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
export declare function testMusicConnection(baseUrl: string, apiKey: string): Promise<{
    ok: boolean;
    message: string;
}>;
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
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map