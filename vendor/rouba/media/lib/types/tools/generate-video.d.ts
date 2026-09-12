/**
 * `generate_video` tool: text-to-video / image-to-video via a configured media
 * provider, run as a `ctx.jobs` background task (video generation takes 1-5
 * minutes and must not block the foreground `execute`).
 *
 * The foreground call only submits the task and publishes the job id; the
 * background `run()` owns a self-built `AbortController` and polls the
 * provider handle until a terminal state, reporting `completed`/`killed`/
 * `failed` through `JobHooks.done`. Billing-sensitive: `videoUrls` stack
 * reference-video billing, `generateAudio`/`returnLastFrame` add extra output
 * — all are capped here and surfaced through the guard.
 *
 * @module @roubaai/media/tools/generate-video
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "generate_video";
/**
 * Register the `generate_video` tool. `ctx.jobs.start` is synchronous and
 * returns a `JobId`; `run()` is synchronous and returns `{ cancel, done }`.
 * The background loop owns its own `AbortController`, decoupled from
 * `exec.signal` once the job id is published (per the background-job contract).
 */
export declare function registerGenerateVideo(ctx: Context): () => void;
//# sourceMappingURL=generate-video.d.ts.map