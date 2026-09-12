/**
 * The media-generation capability family: a provider seam (`ctx.media`) plus
 * the `generate_image` / `generate_video` tools. Provider implementations
 * (such as `@roubaai/media-maizi`) register themselves with
 * `ctx.media.registerImageProvider` / `registerVideoProvider` — registering a
 * provider is all that is needed to wire it to the tools, which stay
 * provider-agnostic.
 *
 * @module @roubaai/media
 */
import { MediaRuntimeLocal } from "./media-local.js";
import { MediaUrlNormalizer } from "./tunnel.js";
import { registerWebRoutes } from "./media-cache.js";
import { registerGenerateImage } from "./tools/generate-image.js";
import { registerGenerateVideo } from "./tools/generate-video.js";
import { registerGenerateMusic } from "./tools/generate-music.js";
import { registerMediaReferenceUrl } from "./tools/media-reference-url.js";
import { registerMediaAssetSave } from "./tools/media-asset-save.js";
import { registerExtractFrame } from "./tools/extract-frame.js";
import { registerMediaCostSummary } from "./tools/media-cost-summary.js";
// Import for its declaration-merging side effect: extends `JobKindMap` with
// `'media-video'` so `ctx.jobs.start({ kind: 'media-video', ... })` type-checks.
import "./job-kind.js";
export { ImageProvider, MusicProvider, VideoProvider } from "./provider.js";
export { MEDIA_SETTINGS_NAMESPACE, readActiveAdapter, readActiveMediaProvider } from "./settings-lookup.js";
export { NoProviderError, MediaRuntimeLocal } from "./media-local.js";
export const name = 'roubaai-media';
export const inject = ['tools', 'jobs', 'attachments', 'webServer'];
export function apply(ctx) {
    // Register the process-local media registry as `ctx.media`; the `Service`
    // constructor registers it and it is withdrawn with this fiber.
    new MediaRuntimeLocal(ctx);
    // Register the local-reference URL normalizer as `ctx.mediaUrl`. It is a
    // `Service` (lifecycle bound to this apply fiber) and starts its static
    // server + tunnel lazily on the first local reference.
    new MediaUrlNormalizer(ctx);
    // Same-origin media stream + cache-lookup routes (see media-cache.ts): the
    // browser plays cached video/audio from the harness host, not the provider
    // CDN. Requires the host webserver (web deployments); the plugin's tools
    // remain usable headless where no webServer route can mount.
    ctx.effect(() => registerWebRoutes(ctx.webServer), 'roubaai-media: media stream routes');
    registerGenerateImage(ctx);
    registerGenerateVideo(ctx);
    registerGenerateMusic(ctx);
    registerMediaReferenceUrl(ctx);
    registerMediaAssetSave(ctx);
    registerExtractFrame(ctx);
    registerMediaCostSummary(ctx);
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map