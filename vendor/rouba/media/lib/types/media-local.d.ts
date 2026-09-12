/**
 * Process-local media provider registry (`ctx.media` implementation). The
 * registry is itself the whitelist: only explicitly registered providers are
 * reachable, and a missing registration surfaces as a `NO_PROVIDER` error
 * (distinct from `MISSING_CREDENTIAL`, which the provider raises when its own
 * credential resolve returns `undefined`).
 *
 * Registration is reversible: `register*Provider` returns a disposer and
 * binds to the apply fiber, so unloading the provider plugin withdraws its
 * providers (design constraint #2 — no global side effect left behind).
 *
 * @module @roubaai/media/media-local
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { ImageProvider, MusicProvider, VideoProvider } from './provider.ts';
import type { MediaRuntime } from './service.ts';
/** Raised when `image()`/`video()`/`music()` find no registered provider (or none by name). */
export declare class NoProviderError extends Error {
    readonly code = "NO_PROVIDER";
    constructor(message: string);
}
/** The process-local media registry, registered as `ctx.media`. */
export declare class MediaRuntimeLocal extends Service implements MediaRuntime {
    private readonly images;
    private readonly videos;
    private readonly musics;
    constructor(ctx: Context);
    registerImageProvider(provider: ImageProvider): () => void;
    registerVideoProvider(provider: VideoProvider): () => void;
    image(provider?: string): ImageProvider;
    video(provider?: string): VideoProvider;
    registerMusicProvider(provider: MusicProvider): () => void;
    music(provider?: string): MusicProvider;
    listImageProviders(): string[];
    listVideoProviders(): string[];
    listMusicProviders(): string[];
}
export default MediaRuntimeLocal;
//# sourceMappingURL=media-local.d.ts.map