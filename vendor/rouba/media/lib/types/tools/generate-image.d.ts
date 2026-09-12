/**
 * `generate_image` tool: text-to-image / reference-image edit via a configured
 * media provider, run as a `ctx.jobs` background task. Image generation takes
 * tens of seconds to minutes (Maizi's synchronous endpoint blocks until the
 * server has generated the image), so the foreground `execute` only starts the
 * job and returns the id — it never blocks on the provider call. The model
 * reads the full result (attachment reference + 24h result URL) through
 * `job_output`; no completion message is pushed into the session, which would
 * otherwise pile up as queued messages and force extra model turns.
 *
 * @module @roubaai/media/tools/generate-image
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "generate_image";
export declare function registerGenerateImage(ctx: Context): () => void;
//# sourceMappingURL=generate-image.d.ts.map