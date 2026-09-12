/**
 * Extend `JobKindMap` via declaration merging so `ctx.jobs.start({ kind:
 * 'media-video', ... })` type-checks. The registry treats each value as an
 * opaque id namespace; this file is imported by the media package entry so the
 * merge takes effect wherever the media package is assembled.
 *
 * @module @roubaai/media/job-kind
 */
export {};
//# sourceMappingURL=job-kind.js.map