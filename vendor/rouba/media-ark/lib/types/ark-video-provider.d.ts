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
import type { Context } from '@deepseek-ai/cordis';
import { VideoProvider } from '@roubaai/media';
import type { MediaProgress, ProviderProbeDraft, ProviderProbeResult, VideoCaps, VideoGenerationResult, VideoGenerateInput, VideoTaskHandle } from '@roubaai/media';
/** Ark's public API base (cn-beijing region). */
export declare const ARK_VIDEO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
/** Credential reference for the Ark API key. */
export declare const ARK_API_KEY_REF = "ARK_API_KEY";
/**
 * Fallback model. Callers name a model on every request, so this only backs
 * `caps()` and the connectivity probe; it is Ark's Seedance 1.5 pro id.
 */
export declare const DEFAULT_VIDEO_MODEL = "doubao-seedance-1-5-pro-251215";
/** Raised when neither the Settings page nor the credential store holds a key. */
export declare class MissingCredentialError extends Error {
    readonly code = "MISSING_CREDENTIAL";
    constructor(reference: string);
}
/** Provider config; every field is optional with a sensible default. */
export interface ArkVideoConfig {
    /** Endpoint base; defaults to {@link ARK_VIDEO_BASE_URL}. */
    baseUrl?: string;
    /** Default model id; defaults to {@link DEFAULT_VIDEO_MODEL}. */
    model?: string;
    /** Credential reference (environment-variable name); defaults to `ARK_API_KEY`. */
    apiKeyEnv?: string;
    /**
     * Settings namespace the roubaai Settings page owns. The key, endpoint, and
     * model a user stores there win over this config; they are read per
     * operation, so editing the page takes effect without reloading the plugin.
     */
    settingsNamespace?: string;
}
/**
 * Volcengine Ark video provider. Submission creates one asynchronous task; the
 * background job polls it and `finalize` probes the produced file.
 */
export declare class ArkVideoProvider extends VideoProvider {
    private readonly ctx;
    readonly provider = "ark";
    readonly defaultModel: string;
    private readonly baseUrl;
    private readonly apiKeyEnv;
    private readonly settingsNamespace;
    constructor(ctx: Context, config?: ArkVideoConfig);
    /**
     * Resolve the API key per operation. The Settings page wins over the
     * credential store: it is the deployment's explicit per-install choice and
     * the one surface a person can edit without touching the environment. The
     * credential store — and through it `ARK_API_KEY` — stays the fallback, so a
     * deployment that never opens the Settings page is unaffected.
     * @returns the resolved key.
     * @throws {MissingCredentialError} when neither source holds a key.
     */
    private resolveKey;
    /**
     * Endpoint base: the Settings page's override when one is stored, else the
     * deployment-configured base. A trailing slash is trimmed so a pasted URL
     * cannot produce a `//` path segment.
     */
    private resolveBaseUrl;
    /**
     * Default model: the Settings page's override when one is stored, else the
     * deployment-configured model. A caller's explicit `input.model` still wins.
     */
    private resolveModel;
    caps(model?: string): VideoCaps;
    /**
     * Ark bills in RMB per second, so this adapter states no USD figure; the
     * ledger records the run unpriced instead of converting at a rate it does
     * not own.
     * @returns always `undefined`.
     */
    estimateCostUsd(): number | undefined;
    submit(input: VideoGenerateInput, signal?: AbortSignal): Promise<VideoTaskHandle>;
    finalize(handle: VideoTaskHandle, signal?: AbortSignal, onProgress?: (progress: MediaProgress) => void): Promise<VideoGenerationResult>;
    /**
     * Probe the endpoint and key the configuration form holds. A read-only task
     * lookup: an id that cannot exist answers 404, which proves the key
     * authenticated and the service answered without creating a task.
     */
    probe(draft: ProviderProbeDraft): Promise<ProviderProbeResult>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=ark-video-provider.d.ts.map