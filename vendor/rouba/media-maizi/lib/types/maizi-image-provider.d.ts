/**
 * MaiziAI image provider — v2 synchronous (OpenAI-compatible) with a 202 →
 * poll fallback, rewritten in TypeScript from autovideo's
 * `MaiziImageClient`. The provider holds no API key: every operation resolves
 * `MAIZI_API_KEY` through `ctx.credentials` and lands the image bytes through
 * `ctx.attachments.saveImage`, so base64 never leaks into the canonical value
 * or the model context.
 *
 * @module @roubaai/media-maizi/maizi-image-provider
 */
import type { Context } from '@deepseek-ai/cordis';
import { ImageProvider } from '@roubaai/media';
import type { ImageCaps, ImageGenerationResult, ImageGenerateInput, MediaProgress, ProviderProbeDraft, ProviderProbeResult } from '@roubaai/media';
/**
 * Default Maizi image base URL (v1 asynchronous). We submit image generation
 * through the v1 async endpoint (returns a `task_id` immediately) and poll
 * `GET /v1/tasks/{id}` to completion — the v2 synchronous endpoint instead
 * blocks the HTTP response until the server has generated the image (which can
 * take minutes), which a background job should not wait on.
 */
export declare const MAIZI_IMAGE_BASE_URL = "https://www.maizitech.xyz/v1";
/** Credential reference for the Maizi API key. */
export declare const MAIZI_API_KEY_REF = "MAIZI_API_KEY";
/** Default image model (GPT Image 2, best quality/cost balance; supports 1K/2K/4K). */
export declare const DEFAULT_IMAGE_MODEL = "gpt-image-2";
/** Foreground poll ceiling for the 202 → poll path (default 6min, matching autovideo's Maizi client which waits 360s for image tasks). */
export declare const DEFAULT_IMAGE_POLL_TIMEOUT_MS = 360000;
/** Raised when the 202 poll exceeds the foreground timeout; carries `taskId`. */
export declare class ImagePollTimeoutError extends Error {
    readonly code = "IMAGE_POLL_TIMEOUT";
    readonly taskId: string;
    constructor(taskId: string);
}
/** Raised when the credential resolve returns `undefined` (distinct from NO_PROVIDER). */
export declare class MissingCredentialError extends Error {
    readonly code = "MISSING_CREDENTIAL";
    constructor(ref: string);
}
/** Provider config; every field is optional with a sensible default. */
export interface MaiziImageConfig {
    /** Endpoint base; defaults to the public v2 API. */
    baseUrl?: string;
    /** Default model id; defaults to {@link DEFAULT_IMAGE_MODEL}. */
    model?: string;
    /** Credential reference (environment-variable name); defaults to `MAIZI_API_KEY`. */
    apiKeyEnv?: string;
    /** Foreground poll ceiling for the 202 → poll path in ms; defaults to 60s. */
    pollTimeoutMs?: number;
    /**
     * Settings namespace the roubaai video plugin's Settings page owns. The
     * stored key and endpoint win over {@link MaiziImageConfig.baseUrl} and the
     * credential reference; they are read per operation, so editing the Settings
     * page takes effect without reloading this plugin.
     * Defaults to {@link DEFAULT_SETTINGS_NAMESPACE}.
     */
    settingsNamespace?: string;
}
/**
 * Maizi image provider (v2 sync + 202 poll fallback). Lands images through
 * `ctx.attachments.saveImage`; never returns raw base64.
 */
export declare class MaiziImageProvider extends ImageProvider {
    private readonly ctx;
    readonly provider = "maizi";
    readonly defaultModel: string;
    private readonly baseUrl;
    private readonly apiKeyEnv;
    private readonly pollTimeoutMs;
    private readonly settingsNamespace;
    constructor(ctx: Context, config?: MaiziImageConfig);
    /**
     * Resolve the API key per operation. The Settings page's active provider
     * wins over the credential store: it is the deployment's explicit
     * per-install choice, and the one surface a person can edit without touching
     * the environment. The credential store — and through it `MAIZI_API_KEY` —
     * stays the fallback, so a deployment that never opens the Settings page is
     * unaffected.
     * @throws {MissingCredentialError} when neither source holds a key.
     */
    private resolveKey;
    /**
     * Endpoint base: the Settings page's active-provider override when one is
     * stored, else the deployment-configured base. A trailing slash is trimmed
     * so a pasted URL cannot produce a `//` path segment.
     */
    private resolveBaseUrl;
    /**
     * Default image model: the Settings page's active-provider override when one
     * is stored, else the deployment-configured model. `ImageGenerateInput`
     * carries no model field, so this value is the only thing that decides which
     * model runs — which is exactly why it has to be re-read per operation.
     */
    private resolveModel;
    generate(input: ImageGenerateInput, signal?: AbortSignal, onProgress?: (progress: MediaProgress) => void): Promise<ImageGenerationResult>;
    /**
     * Degrade a generated-but-not-landed image to a URL-only reference. The
     * model is passed in (not re-resolved) so the reported `providerMeta` names
     * the model this generation actually used.
     */
    private urlRef;
    /**
     * Poll a 202-submitted task until `completed`/`failed`/`violation`, under the
     * foreground timeout ceiling. On timeout, throws {@link ImagePollTimeoutError}
     * carrying the task id (so the model may retry or query later), rather than
     * blocking the foreground indefinitely.
     */
    private pollTask;
    /** Download a completed result URL, reporting download progress. */
    private downloadResult;
    /** Persist image bytes and return the unified result reference. */
    private land;
    /** Reference images Maizi accepts on one image request. */
    caps(): ImageCaps;
    /**
     * Maizi's image rates, in USD per image, keyed `model/resolution`. A matching
     * `any` entry covers a model Maizi prices flat across tiers; a model absent
     * from both is unpriced and returns `undefined`.
     */
    estimateCostUsd(model: string, resolution: string): number | undefined;
    /**
     * Probe the endpoint and key the configuration form holds. A read-only task
     * lookup: an unknown id answers a business 404, which proves reachability and
     * key acceptance without submitting a billable generation.
     */
    probe(draft: ProviderProbeDraft): Promise<ProviderProbeResult>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=maizi-image-provider.d.ts.map