/**
 * `media_cost_summary` tool: fold the automatic media cost ledger
 * (`<workspace>/.assets/media-cost.jsonl`, written by the generate_* tools on
 * every completion) into a model/owner-readable total. Used when the user asks
 * about cost, or when the cost-tracker document needs an actual-vs-expected
 * refresh — the ledger itself is automatic, so this tool never depends on the
 * agent remembering to record anything.
 *
 * @module @roubaai/media/tools/media-cost-summary
 */
import type { Context } from '@deepseek-ai/cordis';
import { MediaCostSummary } from '../cost-ledger.ts';
export declare const name = "media_cost_summary";
/** Fold the summary into a compact markdown block for the caller. */
export declare function renderSummary(summary: MediaCostSummary, projectLabel: string): string;
export declare function registerMediaCostSummary(ctx: Context): () => void;
//# sourceMappingURL=media-cost-summary.d.ts.map