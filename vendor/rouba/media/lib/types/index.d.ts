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
import type { Context } from '@deepseek-ai/cordis';
import './job-kind.ts';
export { ImageProvider, MusicProvider, VideoProvider } from './provider.ts';
export { MEDIA_SETTINGS_NAMESPACE, readActiveAdapter, readActiveMediaProvider } from './settings-lookup.ts';
export type { ActiveMediaProvider, MediaSettingsCategory } from './settings-lookup.ts';
export type { ImageCaps, ImageGenerationResult, ImageGenerateInput, MediaProgress, MediaRef, MusicGenerateInput, MusicGenerationResult, MusicTaskHandle, MusicTaskPoll, MusicTrackInfo, ProviderProbeDraft, ProviderProbeResult, VideoCaps, VideoGenerationResult, VideoGenerateInput, VideoTaskHandle, VideoTaskPoll, } from './provider.ts';
export type { MediaRuntime } from './service.ts';
export { NoProviderError, MediaRuntimeLocal } from './media-local.ts';
export declare const name = "roubaai-media";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map