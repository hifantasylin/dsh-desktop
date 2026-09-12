/**
 * MaiziAI media provider plugin: registers the image and video providers with
 * `ctx.media`. Registering a provider is all that is needed to wire it to the
 * `generate_image`/`generate_video` tools (which stay provider-agnostic).
 *
 * @module @roubaai/media-maizi
 */
import { MaiziImageProvider } from "./maizi-image-provider.js";
import { MaiziVideoProvider } from "./maizi-video-provider.js";
export { MaiziImageProvider, ImagePollTimeoutError, MissingCredentialError } from "./maizi-image-provider.js";
export { MaiziVideoProvider } from "./maizi-video-provider.js";
export { DEFAULT_SETTINGS_NAMESPACE } from "./settings-config.js";
export const name = 'roubaai-media-maizi';
export const inject = ['media', 'credentials', 'attachments'];
export function apply(ctx, config = {}) {
    const disposeImage = ctx.media.registerImageProvider(new MaiziImageProvider(ctx, {
        ...config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {},
        ...config.imageModel !== undefined ? { model: config.imageModel } : {},
        ...config.apiKeyEnv !== undefined ? { apiKeyEnv: config.apiKeyEnv } : {},
        ...config.pollTimeoutMs !== undefined ? { pollTimeoutMs: config.pollTimeoutMs } : {},
        ...config.settingsNamespace !== undefined ? { settingsNamespace: config.settingsNamespace } : {},
    }));
    const disposeVideo = ctx.media.registerVideoProvider(new MaiziVideoProvider(ctx, {
        ...config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {},
        ...config.videoModel !== undefined ? { model: config.videoModel } : {},
        ...config.apiKeyEnv !== undefined ? { apiKeyEnv: config.apiKeyEnv } : {},
        ...config.settingsNamespace !== undefined ? { settingsNamespace: config.settingsNamespace } : {},
    }));
    // Unregister on plugin teardown so a hot reload does not hit
    // `already-registered` (and unloading no longer leaves a misreporting
    // registration behind).
    return () => {
        disposeImage();
        disposeVideo();
    };
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map