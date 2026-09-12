/**
 * `media_asset_save` tool: persist an AI-generated image or video (or an
 * uploaded reference image) into the current session's on-disk asset library,
 * under a deterministic category path and a friendly name, then append an
 * entry to the asset index.
 *
 * Assets live on disk (not as URLs) so they survive provider URL expiry (24h)
 * and tunnel-domain changes; later video-generation steps re-publish a needed
 * asset to a fresh public URL with `media_reference_url`.
 *
 * The save runs in the background (`ctx.jobs`), mirroring `generate_image`:
 * `execute` returns immediately with a job id, and the bytes are fetched and
 * written asynchronously. On completion a message is delivered to the owner's
 * session with the saved path.
 *
 * The asset root is the current session's working directory
 * (`agent.session.header.cwd`, falling back to `process.cwd()`), mirroring how
 * `dsh-agent-teams` scopes its `.agent-teams/` state to the caller's workspace:
 *   `<cwd>/.assets/<category>/<name>.png|.mp4`
 *   `<cwd>/.assets/assets-index.md`
 *
 * The `reference` parameter accepts every shape the model may actually have in
 * context: an attachment JSON object, a host-local image URL, a host-local
 * video URL, a public https URL, a local path, a bare sha256 id, or a Markdown
 * image reference. The tool figures out the type and saves the bytes.
 *
 * @module @roubaai/media/tools/media-asset-save
 */
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
export declare const name = "media_asset_save";
type ResolvedSource = {
    kind: 'attachment';
    ref: ImageAttachmentRef;
    publicUrl?: string;
}
/** A bare content-addressed id: bytes live in the local attachment store;
 *  resolved eagerly (host path + sniffed type) before the job starts. */
 | {
    kind: 'attachment-id';
    attachmentId: string;
} | {
    kind: 'stored-image';
    data: Uint8Array;
    mediaType: string;
    publicUrl?: string;
} | {
    kind: 'url';
    url: string;
} | {
    kind: 'local';
    path: string;
    publicUrl?: string;
};
/** The caller's workspace directory (team state root parent pattern). */
export declare function workspaceOf(agent: Agent | undefined): string;
/** Normalize any reference shape the model may have into a fetchable/readable source. */
export declare function resolveSource(input: string): ResolvedSource | undefined;
export declare function registerMediaAssetSave(ctx: Context): () => void;
/** Extract a public https URL from a reference value, if present. */
export declare function extractPublicUrl(reference: string): string | undefined;
/** Append one line to the project asset index (writes the header on first use). */
export declare function appendIndex(assetsDir: string, entry: {
    category: string;
    name: string;
    path: string;
    ref: string;
    url: string | undefined;
    ts: number;
    mediaType: string;
}): Promise<void>;
export default registerMediaAssetSave;
//# sourceMappingURL=media-asset-save.d.ts.map