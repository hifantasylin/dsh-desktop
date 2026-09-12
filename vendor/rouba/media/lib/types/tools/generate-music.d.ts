/**
 * `generate_music` tool: BGM / song generation via a configured music
 * provider (Suno-style: inspiration or custom lyrics mode), run as a
 * `ctx.jobs` background task — music generation takes 1-3 minutes and must
 * not block the foreground `execute`.
 *
 * One generation request yields **2 candidate tasks** (Suno convention). The
 * background loop polls all of them and resolves as soon as the FIRST one
 * completes (BGM workflows need one usable track, not both); the result
 * carries every task's terminal state so the model can see the skipped
 * sibling. The model reads the result through `job_output` — no completion
 * message is pushed into the session (queued-message tray discipline).
 *
 * The result's `audioUrl` is a 24h provider URL: persist it with
 * `media_asset_save` (reference = the URL) to survive expiry.
 *
 * @module @roubaai/media/tools/generate-music
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "generate_music";
/**
 * Register the `generate_music` tool. `ctx.jobs.start` is synchronous and
 * returns a `JobId`; `run()` is synchronous and returns `{ cancel, done }`.
 */
export declare function registerGenerateMusic(ctx: Context): () => void;
export default registerGenerateMusic;
//# sourceMappingURL=generate-music.d.ts.map