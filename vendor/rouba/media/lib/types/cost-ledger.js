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
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
/**
 * Ledger file for one project: `<workspace>/.assets/<project>/media-cost.jsonl`.
 * A missing project — or one that is actually the workspace path itself (the
 * generate tools fall back to the workspace when the model omits `project`) —
 * falls back to `<workspace>/.assets/default/media-cost.jsonl`, so the
 * workspace's cost data stays in the workspace `.assets` tree under the
 * `default` project rather than under a mangled absolute-path directory.
 */
export function ledgerPath(workspace, project) {
    // Only a relative project name (e.g. `奇幻超人`) is a real project directory;
    // an absent value or an absolute path (the workspace fallback) is unscoped.
    const dir = project === undefined || project.length === 0 || isAbsolute(project)
        ? 'default'
        : project.replace(/[\\/:*?"<>|]/g, '_');
    return join(workspace, '.assets', dir, 'media-cost.jsonl');
}
/** True when the same (project, label) already exists in the ledger. */
export async function isRetry(workspace, project, label) {
    if (label === undefined)
        return false;
    const entries = await readLedger(workspace, project);
    return entries.some(entry => entry.project === project && entry.label === label);
}
/** Append one completion record; `retry` is computed automatically. Returns the full record. */
export async function appendMediaCost(workspace, entry) {
    const full = { ...entry, retry: await isRetry(workspace, entry.project, entry.label) };
    const filePath = ledgerPath(workspace, entry.project);
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(full)}\n`, 'utf8');
    return full;
}
/** Read one ledger file, skipping malformed lines. */
async function readLedgerFile(filePath) {
    let content = '';
    try {
        content = await readFile(filePath, 'utf8');
    }
    catch {
        return [];
    }
    const entries = [];
    for (const line of content.split('\n')) {
        if (line.trim().length === 0)
            continue;
        try {
            entries.push(JSON.parse(line));
        }
        catch { /* skip malformed */ }
    }
    return entries;
}
/**
 * Read ledger entries. With a project, reads only that project's file
 * (`<workspace>/.assets/<project>/media-cost.jsonl`); without one, scans every
 * project directory under `.assets/` (including `default`) so a workspace-wide
 * summary folds all projects together.
 */
export async function readLedger(workspace, project) {
    if (project !== undefined)
        return readLedgerFile(ledgerPath(workspace, project));
    const assetsDir = join(workspace, '.assets');
    let dirs;
    try {
        dirs = (await readdir(assetsDir, { withFileTypes: true }))
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    }
    catch {
        return [];
    }
    const all = [];
    for (const dir of dirs) {
        all.push(...await readLedgerFile(join(assetsDir, dir, 'media-cost.jsonl')));
    }
    return all;
}
/** Fold the ledger into a summary (newest label first). */
export async function summarizeMediaCost(workspace, filter) {
    const all = await readLedger(workspace, filter?.project);
    const entries = all.filter(entry => (filter?.since === undefined || entry.ts >= filter.since));
    const byLabel = new Map();
    const byTool = new Map();
    let totalUsd = 0;
    let retryCount = 0;
    let retryUsd = 0;
    for (const entry of entries) {
        totalUsd += entry.costUsd;
        if (entry.retry) {
            retryCount++;
            retryUsd += entry.costUsd;
        }
        const tool = byTool.get(entry.tool) ?? { tool: entry.tool, count: 0, totalUsd: 0 };
        tool.count++;
        tool.totalUsd += entry.costUsd;
        byTool.set(entry.tool, tool);
        if (entry.label !== undefined) {
            const key = `${entry.project}\u0000${entry.label}`;
            const prior = byLabel.get(key);
            if (prior === undefined) {
                byLabel.set(key, {
                    project: entry.project,
                    label: entry.label,
                    firstUsd: entry.costUsd,
                    retries: entry.retry ? 1 : 0,
                    totalUsd: entry.costUsd,
                    lastTs: entry.ts,
                });
            }
            else {
                prior.retries += entry.retry ? 1 : 0;
                prior.totalUsd += entry.costUsd;
                prior.lastTs = Math.max(prior.lastTs, entry.ts);
            }
        }
    }
    return {
        totalUsd,
        totalCount: entries.length,
        retryCount,
        retryUsd,
        byLabel: [...byLabel.values()].sort((a, b) => b.totalUsd - a.totalUsd),
        byTool: [...byTool.values()].sort((a, b) => b.totalUsd - a.totalUsd),
    };
}
//# sourceMappingURL=cost-ledger.js.map