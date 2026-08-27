/**
 * Override the packaged DSH client packages with locally-built artifacts from
 * the deepseek-harness fork, so media/brand changes (MediaMessageNode classify,
 * Rouba brand, reportProgress, …) that live in the upstream workspace's lib/
 * actually run inside the exe.
 *
 * Runs after electron-builder has produced the unpacked app directory
 * (afterPack). It copies each local package's lib/ over the corresponding
 * package inside app.asar.unpacked/node_modules/@deepseek-ai/<pkg>/lib, which
 * is where the desktop app keeps the un-packed node_modules it boots the DSH
 * runtime from.
 *
 * The upstream fork root is resolved from DSH_UPSTREAM_ROOT, defaulting to
 * F:/Github/deepseek-harness. The list is the media/brand patch surface; each
 * entry maps a package name to its path under the upstream packages/ tree.
 */

import { cpSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package name → upstream packages/ subpath, for the media/brand patch surface. */
const OVERRIDES = [
  { name: '@deepseek-ai/dsh-client-ui-conversation', sub: 'packages/client/ui-conversation' },
  { name: '@deepseek-ai/dsh-client-runtime', sub: 'packages/client/runtime' },
  { name: '@deepseek-ai/dsh-client-ui-sidebar', sub: 'packages/client/ui-sidebar' },
  { name: '@deepseek-ai/dsh-client-ui-renderer', sub: 'packages/client/ui-renderer' },
  { name: '@deepseek-ai/dsh-client-ui-brand-rouba', sub: 'packages/client/ui-brand-rouba' },
  { name: '@deepseek-ai/dsh-client-ui-attachment', sub: 'packages/client/ui-attachment' },
  { name: '@deepseek-ai/dsh-host-apiproxy', sub: 'packages/host/apiproxy' },
  { name: '@deepseek-ai/dsh-llm', sub: 'packages/llm/llm' },
  { name: '@deepseek-ai/dsh-jobs', sub: 'packages/jobs/jobs' },
  { name: '@deepseek-ai/dsh-jobs-local', sub: 'packages/jobs/jobs-local' },
]

const scriptDir = dirname(fileURLToPath(import.meta.url))
const upstreamRoot = resolve(process.env.DSH_UPSTREAM_ROOT ?? join(scriptDir, '..', '..', 'deepseek-harness'))

/**
 * Apply one override from the upstream fork into the packaged app directory.
 * @param appOutDir - Completed unpacked application directory (electron-builder afterPack `appOutDir`).
 * @param name - Package name to override.
 * @param sub - Upstream packages/ subpath.
 */
function applyOverride(appOutDir, name, sub) {
  const srcLib = join(upstreamRoot, sub, 'lib')
  const dstLib = join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', ...name.split('/'), 'lib')
  if (!existsSync(srcLib)) {
    console.log(`[override-local-dsh] skip ${name}: upstream lib missing (${srcLib})`)
    return
  }
  if (!existsSync(dstLib)) {
    console.log(`[override-local-dsh] skip ${name}: packaged lib missing (${dstLib})`)
    return
  }
  cpSync(srcLib, dstLib, { recursive: true, force: true })
  console.log(`[override-local-dsh] overrode ${name} ← ${srcLib}`)
}

/**
 * Run all overrides against a packaged app directory.
 * @param appOutDir - Completed unpacked application directory.
 */
export function overridePackagedDshPackages(appOutDir) {
  console.log(`[override-local-dsh] upstream root: ${upstreamRoot}`)
  for (const { name, sub } of OVERRIDES) {
    applyOverride(appOutDir, name, sub)
  }
}

// CLI entry: first positional argument is the app output directory.
const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === resolve(process.argv[1] ?? '')) {
  const appOutDir = process.argv[2]
  if (appOutDir === undefined) {
    console.error('usage: node override-local-dsh-packages.mjs <appOutDir>')
    process.exit(2)
  }
  overridePackagedDshPackages(appOutDir)
}
