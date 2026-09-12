/**
 * Volcengine Ark media provider plugin: registers the video provider with
 * `ctx.media`. Registering a provider is all that is needed to wire it to
 * `generate_video`, which stays provider-agnostic — the Settings page selects
 * this adapter by naming `ark` on the active video row.
 * @module @roubaai/media-ark
 */
import { ArkVideoProvider } from "./ark-video-provider.js";
export { ArkVideoProvider, MissingCredentialError, ARK_API_KEY_REF, ARK_VIDEO_BASE_URL, DEFAULT_VIDEO_MODEL, } from "./ark-video-provider.js";
export { DEFAULT_SETTINGS_NAMESPACE } from "./settings-config.js";
export const name = 'roubaai-media-ark';
export const inject = ['media', 'credentials'];
export function apply(ctx, config = {}) {
    const disposeVideo = ctx.media.registerVideoProvider(new ArkVideoProvider(ctx, {
        ...config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {},
        ...config.videoModel !== undefined ? { model: config.videoModel } : {},
        ...config.apiKeyEnv !== undefined ? { apiKeyEnv: config.apiKeyEnv } : {},
        ...config.settingsNamespace !== undefined ? { settingsNamespace: config.settingsNamespace } : {},
    }));
    // Unregister on teardown so a hot reload does not hit `already-registered`.
    return () => {
        disposeVideo();
    };
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map