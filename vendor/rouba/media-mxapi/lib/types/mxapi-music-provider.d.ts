/**
 * MxAPI music provider — Suno-style v2 asynchronous generate/task semantics.
 * The provider holds no API key (resolves `MXAPI_API_KEY` per operation) and
 * normalizes MxAPI's state machine (`result.status` 1=queued/2=generating,
 * 3=complete, 4=failed; `data.status` string form) into the provider-agnostic
 * {@link MusicTaskPoll}.
 *
 * One generate call returns **2 task ids** (Suno returns two candidates per
 * request); the tool's polling loop resolves on the first completed one.
 * Provider-specific facts — the `extend` JSON blob, points costing, the
 * `custom_id` reuse contract — stay inside this implementation. The completed
 * mp3 URL is NOT downloaded here (music is small, but the tool result's URL
 * feeds `media_asset_save`, which persists bytes itself).
 *
 * @module @roubaai/media-mxapi/mxapi-music-provider
 */
import type { Context } from '@deepseek-ai/cordis';
import { MusicProvider } from '@roubaai/media';
import type { MusicGenerateInput, MusicTaskHandle, MusicTaskPoll, MusicTrackInfo, ProviderProbeDraft, ProviderProbeResult } from '@roubaai/media';
/** Default MxAPI music base URL (Suno v2 async). */
export declare const MXAPI_MUSIC_BASE_URL = "https://open.mxapi.org/api/v2/music";
/** Credential reference for the MxAPI key. */
export declare const MXAPI_API_KEY_REF = "MXAPI_API_KEY";
/** Default Suno model version (v4.5+, the doc-recommended balance). */
export declare const DEFAULT_MUSIC_MODEL = "chirp-bluejay";
/** Raised on non-2xx or non-`code:200` responses, and on a missing credential. */
export declare class MxapiApiError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number);
}
export declare class MissingCredentialError extends Error {
    readonly envVar: string;
    constructor(envVar: string);
}
/** Provider configuration. */
export interface MxapiMusicConfig {
    /** Endpoint base override (defaults to {@link MXAPI_MUSIC_BASE_URL}). */
    baseUrl?: string;
    /** Default Suno model version (mv). */
    model?: string;
    /** Credential reference (environment-variable name); defaults to `MXAPI_API_KEY`. */
    apiKeyEnv?: string;
}
/**
 * MxAPI music provider (Suno v2 submit/poll). Resolve the API key per
 * operation through `ctx.credentials`; never persist it.
 */
export declare class MxapiMusicProvider extends MusicProvider {
    readonly provider = "mxapi";
    readonly defaultModel: string;
    private readonly ctx;
    private readonly baseUrl;
    private readonly apiKeyEnv;
    constructor(ctx: Context, config?: MxapiMusicConfig);
    /**
     * Resolve the API key for one operation: the Settings page's active music
     * provider wins, then the credential store (`MXAPI_API_KEY`) — the same
     * order the Maizi providers use (settings first, then credentials/env).
     */
    private resolveKey;
    private request;
    submit(input: MusicGenerateInput, signal?: AbortSignal): Promise<MusicTaskHandle[]>;
    /** Poll one task, normalizing MxAPI's dual status fields. */
    pollTask(taskId: string, signal?: AbortSignal): Promise<MusicTaskPoll>;
    /** Fetch the terminal track info for a task that polled `succeeded`. */
    fetchTrack(taskId: string, signal?: AbortSignal): Promise<MusicTrackInfo>;
    /**
     * Probe the endpoint and key a configuration form holds. The music API is not
     * OpenAI-compatible and has no `GET /models`, so the cheapest authenticated
     * request is a task lookup: an unknown id answers a business-JSON 404, which
     * still proves the endpoint is reachable and the key accepted (an
     * unauthorized key is refused before the id is read).
     */
    probe(draft: ProviderProbeDraft): Promise<ProviderProbeResult>;
    /** Connectivity test: resolves the key, then issues a cheap task probe. */
    testConnection(): Promise<boolean>;
}
export default MxapiMusicProvider;
//# sourceMappingURL=mxapi-music-provider.d.ts.map