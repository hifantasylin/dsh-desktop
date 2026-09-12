/**
 * `media_extract_frame` tool: extract still frames from a video (any time or
 * a uniform spread) and land them into the project asset library, so a clip
 * can be continued/referenced later (续拍 / 关键帧参考). Uses ffmpeg/ffprobe
 * from PATH (the DSH host is expected to provide them; see FFMPEG_* env or
 * plain `ffmpeg`). Reuses `media_asset_save`'s reference resolution + index
 * append so extracted frames behave exactly like any other asset.
 *
 * @module @roubaai/media/tools/extract-frame
 */
import { Context } from '@deepseek-ai/cordis';
export declare const name = "media_extract_frame";
export declare function registerExtractFrame(ctx: Context): () => void;
export default registerExtractFrame;
//# sourceMappingURL=extract-frame.d.ts.map