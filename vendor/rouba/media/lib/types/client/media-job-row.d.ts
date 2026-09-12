/**
 * The `job_output` media row: renders a settled media-generation job's media
 * inline in the tool result card — an image through the session-authorized
 * loader (fast local attachment) or the provider URL, an inline
 * `<video controls>` for video, an `<audio controls>` player for music.
 * Video/audio prefer the generation job's signed local stream URL
 * (`mediaCacheUrl`) and fall back to the provider CDN link if that stream is
 * gone (host restarted) or unreachable.
 *
 * The model does not need to embed URLs or call read_image: reading the
 * completed job through `job_output` displays the media here. Every other
 * `job_output` shape falls back to the raw result text (a claimed keyed view
 * suppresses the generic card, so the text must stay visible here).
 * @module @roubaai/media/client/media-job-row
 */
import { type JSX } from 'react';
/** The slice of the keyed toolview owner the row reads. */
export interface MediaJobRowProps {
    /** Frozen running call or settled result node. */
    block: unknown;
    /**
     * Session-authorized image URL loader supplied by the chat node owner
     * (`ToolCallOwnerProps.loadImage`); present on composed tool views.
     */
    loadImage?: unknown;
}
/**
 * Render the row: rich inline media for a settled media-generation job, raw
 * result text otherwise. The media body lives in this tool-result card — the
 * model never copies URLs into its reply text.
 * @param props - the owner slice the keyed slot supplies.
 * @returns the row element.
 */
export declare function MediaJobRow(props: MediaJobRowProps): JSX.Element;
//# sourceMappingURL=media-job-row.d.ts.map