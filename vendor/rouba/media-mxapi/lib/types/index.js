/**
 * MxAPI music provider plugin: registers the music provider with `ctx.media`.
 * Registering a provider is all that is needed to wire it to the
 * `generate_music` tool (which stays provider-agnostic).
 *
 * @module @roubaai/media-mxapi
 */
import { MxapiMusicProvider } from "./mxapi-music-provider.js";
export { MxapiMusicProvider, MxapiApiError, MissingCredentialError } from "./mxapi-music-provider.js";
export const name = 'roubaai-media-mxapi';
export const inject = ['media', 'credentials'];
export function apply(ctx, config = {}) {
    return ctx.media.registerMusicProvider(new MxapiMusicProvider(ctx, {
        ...config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {},
        ...config.model !== undefined ? { model: config.model } : {},
        ...config.apiKeyEnv !== undefined ? { apiKeyEnv: config.apiKeyEnv } : {},
    }));
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map