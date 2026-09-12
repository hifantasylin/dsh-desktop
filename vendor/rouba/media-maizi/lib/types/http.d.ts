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
/** Product identity sent as `User-Agent` (public, non-secret facts only). */
export declare const USER_AGENT: string;
/** Raised for a provider HTTP failure carrying the status and a bounded body snippet. */
export declare class MaiziHttpError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number);
}
/**
 * Raised for a transport-level failure (DNS, connect, TLS, socket reset —
 * whatever the runtime surfaces as a bare `TypeError: fetch failed`) AFTER the
 * retry loop has been exhausted. The message always carries the stage that
 * failed and the underlying cause, so callers and the LLM can tell "the
 * provider rejected the request" from "the network dropped before we could
 * ask", and can tell "generation failed" from "the result could not be
 * downloaded".
 */
export declare class MaiziNetworkError extends Error {
    constructor(message: string, cause?: unknown);
}
/** True when the error is a transport-level failure (not an abort, not an HTTP status). */
export declare function isNetworkError(error: unknown): error is MaiziNetworkError;
/**
 * Human meaning for the Maizi/upstream HTTP status codes the LLM is most
 * likely to act on. Kept on one line each so the job detail stays a single
 * readable line with the code embedded, e.g. `[402] 余额不足，请充值后再试`.
 */
export declare function httpStatusMeaning(status: number | undefined): string;
/** Pull the HTTP status off an error when it carries one (MaiziHttpError does). */
export declare function errorStatus(error: unknown): number | undefined;
/** Render `[status] meaning` when a status is present, else the bare message. */
export declare function statusTag(error: unknown): string;
/** Build the common request headers: JSON content type + attribution. */
export declare function jsonHeaders(apiKey: string): Record<string, string>;
/**
 * POST a JSON body and parse the JSON response, retrying transient failures
 * (network errors and 5xx) up to {@link RETRY_ATTEMPTS} times. A 4xx returns
 * the status without retrying so the provider's own validation errors surface
 * immediately.
 */
export declare function postJson(url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<{
    status: number;
    data: unknown;
}>;
/**
 * GET a JSON response, retrying transient failures. Used for polling task
 * state (`GET /v1/tasks/{id}` and the image v2 202 poll path).
 */
export declare function getJson(url: string, apiKey: string, signal?: AbortSignal): Promise<{
    status: number;
    data: unknown;
}>;
/** Download options: size bounds and an inactivity timeout. */
export interface DownloadOptions {
    /** Refuse a response body larger than this many bytes. */
    maxBytes?: number;
    /** Require the downloaded body to be at least this many bytes (catches truncated downloads). */
    minBytes?: number;
    /** Inactivity (no chunk received) timeout in ms; resets on each chunk. */
    inactivityTimeoutMs?: number;
    /**
     * Optional progress callback fired on each received chunk with the running
     * received byte count and the total expected bytes (from `content-length`,
     * which may be absent). Lets a caller surface real download progress.
     */
    onProgress?: (receivedBytes: number, totalBytes: number | undefined) => void;
}
/**
 * Download a URL into raw bytes (the 24h-valid result file), streaming the
 * body and verifying size bounds, with transient-failure retry. The caller
 * owns `maxBytes`; providers pass `minBytes` (e.g. a video floor) and an
 * inactivity timeout so a truncated download is retried rather than landed as
 * a corrupt file.
 */
export declare function downloadBytes(url: string, signal?: AbortSignal, options?: DownloadOptions): Promise<Uint8Array>;
/** Stream options: optional byte range passthrough for the CDN. */
export interface StreamOptions {
    /** Optional `Range: bytes=start-end` header value to forward upstream. */
    range?: string;
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
export declare function streamBytes(url: string, signal?: AbortSignal, options?: StreamOptions): Promise<{
    stream: ReadableStream<Uint8Array>;
    status: number;
    headers: Headers;
} | undefined>;
//# sourceMappingURL=http.d.ts.map