/**
 * MaiziAI media provider plugin: registers the image and video providers with
 * `ctx.media`. Registering a provider is all that is needed to wire it to the
 * `generate_image`/`generate_video` tools (which stay provider-agnostic).
 *
 * @module @roubaai/media-maizi
 */
import type { Context } from '@deepseek-ai/cordis';
export { MaiziImageProvider, ImagePollTimeoutError, MissingCredentialError } from './maizi-image-provider.ts';
export type { MaiziImageConfig } from './maizi-image-provider.ts';
export { MaiziVideoProvider } from './maizi-video-provider.ts';
export type { MaiziVideoConfig } from './maizi-video-provider.ts';
export { DEFAULT_SETTINGS_NAMESPACE } from './settings-config.ts';
export declare const name = "roubaai-media-maizi";
export declare const inject: string[];
/** Plugin config; every field is optional. */
export interface Config {
    /** Endpoint base override (defaults to the public Maizi API). */
    baseUrl?: string;
    /** Default image model id. */
    imageModel?: string;
    /** Default video model id. */
    videoModel?: string;
    /** Credential reference (environment-variable name); defaults to `MAIZI_API_KEY`. */
    apiKeyEnv?: string;
    /** Foreground image 202→poll ceiling in ms (default 60s). */
    pollTimeoutMs?: number;
    /**
     * Settings namespace the roubaai video plugin's Settings page owns. The key
     * and endpoint a user stores there override {@link Config.baseUrl} and the
     * credential reference; leave unset to use {@link DEFAULT_SETTINGS_NAMESPACE}.
     */
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