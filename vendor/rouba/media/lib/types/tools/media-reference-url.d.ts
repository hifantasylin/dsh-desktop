/**
 * `media_reference_url` tool: turn a reference image that the media provider
 * cannot reach (a local file path, a host-local `/api/...` URL, or any value
 * that is not a public https URL) into a public https URL the provider can
 * fetch as a `refImages` / `imageUrls` entry.
 *
 * The model decides when to call this: when it wants to use a reference image
 * (an uploaded attachment, a local path, or an earlier generated image whose
 * URL is host-local) but the generation tool requires a reachable public URL,
 * it first calls this tool to obtain the public URL, then passes that URL into
 * `generate_image` / `generate_video`.
 *
 * @module @roubaai/media/tools/media-reference-url
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "media_reference_url";
export declare function registerMediaReferenceUrl(ctx: Context): () => void;
export default registerMediaReferenceUrl;
//# sourceMappingURL=media-reference-url.d.ts.map