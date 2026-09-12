/**
 * Minimal JSON and result-probe HTTP helper for the Ark adapter, over the
 * global `fetch` (Node's undici). Only the calls this provider makes: create a
 * generation task, poll it, and confirm the produced file is reachable.
 *
 * No third-party runtime dependency: `fetch` is a Node >= 22 global.
 * @module @roubaai/media-ark/http
 */
/** Raised for an Ark HTTP failure carrying the status and a bounded body snippet. */
export declare class ArkHttpError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number);
}
/**
 * Raised for a transport-level failure (DNS, connect, TLS, socket reset) after
 * the retry loop is exhausted. The message always names the stage that failed,
 * so a caller can tell "the provider rejected the request" from "the network
 * dropped before we could ask".
 */
export declare class ArkNetworkError extends Error {
    constructor(message: string, cause?: unknown);
}
/** Whether an error is a transport-level failure rather than an HTTP answer. */
export declare function isNetworkError(error: unknown): error is ArkNetworkError;
/**
 * Human meaning for the Ark status codes a caller is most likely to act on.
 * Kept to one line each so a job detail stays a single readable line.
 * @param status - the HTTP status, when one was received.
 * @returns the meaning, or a generic rendering.
 */
export declare function arkStatusMeaning(status: number | undefined): string;
/** Render `[status] meaning` when a status is present, else the bare message. */
export declare function statusTag(error: unknown): string;
/** Request headers: JSON content type plus the Ark bearer credential. */
export declare function arkHeaders(apiKey: string): Record<string, string>;
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
export declare function postJson(url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<{
    status: number;
    data: unknown;
}>;
/**
 * GET a JSON response, retrying transient failures. Used to poll task state.
 * @param url - the absolute endpoint.
 * @param apiKey - the Ark API key to present.
 * @param signal - cancellation forwarded to `fetch`.
 * @returns the status and parsed body.
 */
export declare function getJson(url: string, apiKey: string, signal?: AbortSignal): Promise<{
    status: number;
    data: unknown;
}>;
/** What a result-URL probe reports: reachability, plus the size when stated. */
export interface ResultProbe {
    status: number;
    /** Total byte size from `content-length`, when the CDN states one. */
    sizeBytes?: number;
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
export declare function probeResult(url: string, signal?: AbortSignal): Promise<ResultProbe | undefined>;
//# sourceMappingURL=http.d.ts.map