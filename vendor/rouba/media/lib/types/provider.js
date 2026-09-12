/**
 * Media generation provider seam: the provider-neutral abstract classes a
 * media provider implements. Mirrors autovideo's `base.py`
 * `BaseImageGenerator`/`BaseVideoGenerator` in TypeScript, but keeps only the
 * cross-provider minimal public contract — provider-specific fields (Maizi's
 * `violation`, `queued`, `costUsd`, multi-URL structure, 24h download policy)
 * live in the provider implementation layer, never here.
 *
 * Images return a landed resource reference (never raw base64); video is
 * asynchronous, so it is split into `submit` + `finalize` over a pollable
 * handle.
 *
 * @module @roubaai/media/provider
 */
export class ImageProvider {
}
export class VideoProvider {
}
export class MusicProvider {
}
//# sourceMappingURL=provider.js.map