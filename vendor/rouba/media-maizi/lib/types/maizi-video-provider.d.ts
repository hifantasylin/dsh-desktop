/**
 * MaiziAI video provider — v1 asynchronous submit/poll, rewritten from
 * autovideo's Maizi video semantics. The provider holds no API key (resolves
 * `MAIZI_API_KEY` per operation) and normalizes Maizi's native state machine
 * (`queued`/`pending`/`processing` → running, `completed` → succeeded,
 * `failed`/`violation` → failed) into the provider-agnostic {@link VideoTaskPoll}.
 *
 * Maizi-specific facts — the `violation` state, multi-`result_urls`, `costUsd`,
 * the 24h download policy — stay inside this implementation. The final video
 * file is downloaded immediately on `finalize` and landed to a local file
 * (24h-valid URLs must not be returned bare).
 *
 * @module @roubaai/media-maizi/maizi-video-provider
 */
import type { Context } from '@deepseek-ai/cordis';
import { VideoProvider } from '@roubaai/media';
import type { MediaProgress, ProviderProbeDraft, ProviderProbeResult, VideoCaps, VideoGenerationResult, VideoGenerateInput, VideoTaskHandle } from '@roubaai/media';
/** Default Maizi video base URL (v1 asynchronous). */
export declare const MAIZI_VIDEO_BASE_URL = "https://www.maizitech.xyz/v1";
/** Default video model (Seedance 2.0 mini). */
export declare const DEFAULT_VIDEO_MODEL = "doubao-seedance-2.0-mini";
/** Provider config; every field is optional with a sensible default. */
export interface MaiziVideoConfig {
    /** Endpoint base; defaults to the public v1 API. */
    baseUrl?: string;
    /** Default model id; defaults to {@link DEFAULT_VIDEO_MODEL}. */
    model?: string;
    /** Credential reference (environment-variable name); defaults to `MAIZI_API_KEY`. */
    apiKeyEnv?: string;
    /**
     * Settings namespace the roubaai video plugin's Settings page owns. The
     * stored key and endpoint win over {@link MaiziVideoConfig.baseUrl} and the
     * credential reference; they are read per operation, so editing the Settings
     * page takes effect without reloading this plugin.
     * Defaults to {@link DEFAULT_SETTINGS_NAMESPACE}.
     */
    settingsNamespace?: string;
}
/**
 * Maizi video provider (v1 async submit + poll + finalize). The final video is
 * downloaded on `finalize` and landed to a local file; the 24h-valid URL is
 * never returned bare.
 */
export declare class MaiziVideoProvider extends VideoProvider {
    private readonly ctx;
    readonly provider = "maizi";
    readonly defaultModel: string;
    private readonly baseUrl;
    private readonly apiKeyEnv;
    private readonly settingsNamespace;
    constructor(ctx: Context, config?: MaiziVideoConfig);
    /**
     * Resolve the API key per operation. The Settings page wins over the
     * credential store: it is the deployment's explicit per-install choice, and
     * the one surface a person can edit without touching the environment. The
     * credential store — and through it `MAIZI_API_KEY` — stays the fallback, so
     * a deployment that never opens the Settings page is unaffected.
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
     * Default video model: the Settings page's override when one is stored, else
     * the deployment-configured model. A caller's explicit `input.model` still
     * wins — this is only the default the request falls back to.
     */
    private resolveModel;
    submit(input: VideoGenerateInput, signal?: AbortSignal): Promise<VideoTaskHandle>;
    finalize(handle: VideoTaskHandle, signal?: AbortSignal, onProgress?: (progress: MediaProgress) => void): Promise<VideoGenerationResult>;
    /**
     * Bounds for the model being asked for. An omitted model resolves to the one
     * this provider would use anyway, so a caller that never names a model still
     * validates against the right generation.
     */
    caps(model?: string): VideoCaps;
    /**
     * Maizi's Seedance rates, in USD per second. A tier Maizi does not price
     * returns `undefined`; the tool then records the run without an estimate.
     */
    estimateCostUsd(model: string, durationSeconds: number, resolution: string): number | undefined;
    /**
     * Probe the endpoint and key the configuration form holds. A read-only task
     * lookup: an unknown id answers a business 404, which proves reachability and
     * key acceptance without creating a task.
     */
    probe(draft: ProviderProbeDraft): Promise<ProviderProbeResult>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=maizi-video-provider.d.ts.map