/**
 * Media cost ledger — automatic, append-only per-completion record of media
 * generation cost. The `generate_image` / `generate_video` / `generate_music`
 * tools write one line per completed job themselves, so cost tracking is
 * reliable even when the agent forgets to record it. The ledger lives at
 * `<workspace>/.assets/media-cost.jsonl` (one JSON object per line); the
 * `media_cost_summary` tool folds it into an owner/model-readable total and
 * drives the cost-tracker document's actual-vs-expected comparison.
 *
 * @module @roubaai/media/cost-ledger
 */
/** One ledger line, written on every media job completion. */
export interface MediaCostEntry {
    /** Completion timestamp (ms). */
    ts: number;
    tool: 'image' | 'video' | 'music';
    model: string;
    /** LLM-provided project name (奇幻超人); falls back to the workspace when absent. */
    project: string;
    /** LLM-provided shot identifier (EP01_镜02_镇民躲藏); drives retry detection. */
    label?: string;
    /** Readable spec: image resolution | video duration×resolution | music duration. */
    spec: string;
    /** USD cost; provider-reported for video, estimated from the rate table otherwise. */
    costUsd: number;
    /** reported = provider returned a real cost; estimated = rate-table lookup. */
    source: 'reported' | 'estimated';
    taskId?: string;
    /** Same (project, label) already present in the ledger => this is a retry. */
    retry: boolean;
}
/**
 * Ledger file for one project: `<workspace>/.assets/<project>/media-cost.jsonl`.
 * A missing project — or one that is actually the workspace path itself (the
 * generate tools fall back to the workspace when the model omits `project`) —
 * falls back to `<workspace>/.assets/default/media-cost.jsonl`, so the
 * workspace's cost data stays in the workspace `.assets` tree under the
 * `default` project rather than under a mangled absolute-path directory.
 */
export declare function ledgerPath(workspace: string, project: string | undefined): string;
/** True when the same (project, label) already exists in the ledger. */
export declare function isRetry(workspace: string, project: string, label: string | undefined): Promise<boolean>;
/** Append one completion record; `retry` is computed automatically. Returns the full record. */
export declare function appendMediaCost(workspace: string, entry: Omit<MediaCostEntry, 'retry'>): Promise<MediaCostEntry>;
/**
 * Read ledger entries. With a project, reads only that project's file
 * (`<workspace>/.assets/<project>/media-cost.jsonl`); without one, scans every
 * project directory under `.assets/` (including `default`) so a workspace-wide
 * summary folds all projects together.
 */
export declare function readLedger(workspace: string, project?: string): Promise<MediaCostEntry[]>;
/** A per-label fold: first cost, retry count, total cost. */
export interface LabelCost {
    project: string;
    label: string;
    firstUsd: number;
    retries: number;
    totalUsd: number;
    lastTs: number;
}
/** Cost summary folded from the ledger, optionally filtered by project / since. */
export interface MediaCostSummary {
    totalUsd: number;
    totalCount: number;
    retryCount: number;
    retryUsd: number;
    byLabel: LabelCost[];
    byTool: Array<{
        tool: MediaCostEntry['tool'];
        count: number;
        totalUsd: number;
    }>;
}
/** Fold the ledger into a summary (newest label first). */
export declare function summarizeMediaCost(workspace: string, filter?: {
    project?: string;
    since?: number;
}): Promise<MediaCostSummary>;
//# sourceMappingURL=cost-ledger.d.ts.map