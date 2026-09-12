/**
 * Volcengine Ark media provider plugin: registers the video provider with
 * `ctx.media`. Registering a provider is all that is needed to wire it to
 * `generate_video`, which stays provider-agnostic — the Settings page selects
 * this adapter by naming `ark` on the active video row.
 * @module @roubaai/media-ark
 */
import type { Context } from '@deepseek-ai/cordis';
export { ArkVideoProvider, MissingCredentialError, ARK_API_KEY_REF, ARK_VIDEO_BASE_URL, DEFAULT_VIDEO_MODEL, } from './ark-video-provider.ts';
export type { ArkVideoConfig } from './ark-video-provider.ts';
export { DEFAULT_SETTINGS_NAMESPACE } from './settings-config.ts';
export declare const name = "roubaai-media-ark";
export declare const inject: string[];
/** Plugin config; every field is optional. */
export interface Config {
    /** Endpoint base override (defaults to the public Ark API). */
    baseUrl?: string;
    /** Default video model id. */
    videoModel?: string;
    /** Credential reference (environment-variable name); defaults to `ARK_API_KEY`. */
    apiKeyEnv?: string;
    /** Settings namespace the roubaai Settings page owns. */
    settingsNamespace?: string;
}
export declare function apply(ctx: Context, config?: Config): () => void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map