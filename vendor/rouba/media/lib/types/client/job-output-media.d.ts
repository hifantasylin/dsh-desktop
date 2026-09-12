/**
 * Pure derivation: the media one settled `job_output` carries when the job
 * behind it is a completed media generation (image / video / music).
 *
 * `generate_*` tools run as background jobs whose output is
 * `JSON.stringify(<GenerationResult>)`. The model reads that JSON through
 * `job_output` as plain text — the chat stream has no media block to render —
 * so this module recovers the displayable media from the text and lets the
 * client half show it without a follow-up round trip.
 *
 * - image: a landed attachment reference plus the provider's 24h result URL.
 *   The card renders the attachment through the session-authorized image
 *   loader when one is supplied (fast, local) and falls back to the CDN URL.
 * - video / music: a provider CDN https URL (24h validity) rendered by direct
 *   `<video>`/`<audio>` playback. When the generation job cached the media
 *   locally it also carries `mediaCacheUrl` — a signed loopback stream URL the
 *   card prefers (fast); the CDN URL remains as the fallback.
 *
 * Every field arrives unvalidated (an old log, a failed job, a different job
 * kind), so any mismatch declines to null and the toolview falls back to the
 * raw result text. Attachment ids are checked for existence only: they are
 * opaque and provider-owned.
 * @module @roubaai/media/client/job-output-media
 */
/** Minimal durable image reference face the loader needs (subset of ImageAttachmentRef). */
export interface JobImageAttachment {
    readonly attachmentId: string;
    readonly mediaType: string;
}
/**
 * One displayable media outcome of a settled media-generation `job_output`.
 * Every branch carries either a local/authorized render source or a public
 * https URL the browser can render directly.
 */
export type JobOutputMedia = {
    readonly kind: 'image';
    /** Landed attachment for the session-authorized loader, when present. */
    readonly attachment?: JobImageAttachment;
    /** Provider 24h CDN URL, used when no loader/attachment is available. */
    readonly url?: string;
} | {
    readonly kind: 'video';
    /** Provider 24h CDN URL (plays first; the card switches to the local stream when cached). */
    readonly url: string;
    readonly mediaType: string;
} | {
    readonly kind: 'music';
    /** Provider 24h CDN URL (plays first; the card switches to the local stream when cached). */
    readonly audioUrl: string;
    readonly coverUrl?: string;
    readonly title?: string;
    readonly durationSeconds?: number;
};
/**
 * Recover the displayable media one settled `job_output` carries.
 * @param block - the frozen settled result node (a record with `content`).
 * @returns the media outcome, or null when this output is not a completed
 *   media generation.
 */
export declare function jobOutputMedia(block: Record<string, unknown>): JobOutputMedia | null;
//# sourceMappingURL=job-output-media.d.ts.map