/**
 * Typed `fetch` wrapper over the plugin's fenced JSON route. Every call posts
 * to `<API_PREFIX>/<method>` and returns the envelope's `value`; a non-ok
 * envelope or a transport failure surfaces as {@link RoubaaiApiError} carrying
 * the wire code, so the settings surface can show the reason inline instead of
 * failing silently.
 * @module @roubaai/settings/client/api
 */
import type { MediaCategory, SettingsView, TestResult } from '../shared.ts';
/** The host route prefix (kept in sync with the host half's `API_PREFIX`). */
export declare const API_PREFIX = "/api/roubaai-video";
/** One wire failure. */
export declare class RoubaaiApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** The route surface used by the settings section. */
export declare const api: {
    /** Read the redacted configuration and its revision. */
    settingsGet: () => Promise<SettingsView>;
    /**
     * Merge a patch into the configuration.
     * @param patch - partial settings (a `secret` field is written, never read back here).
     * @param expectedRevision - the revision the caller read; a namespace that
     * moved past it is refused so a concurrent edit is never overwritten.
     */
    settingsUpdate: (patch: Record<string, unknown>, expectedRevision?: number) => Promise<SettingsView>;
    /**
     * Probe one endpoint with one key — the values the caller is looking at, an
     * unsaved key included. Nothing is persisted by this call.
     * @param draft - the endpoint, key, category, adapter, and model the card shows.
     * @returns the probe's outcome.
     */
    test: (draft: {
        baseUrl: string;
        apiKey: string;
        category: MediaCategory;
        adapter?: string;
        model?: string;
    }) => Promise<TestResult>;
};
//# sourceMappingURL=api.d.ts.map