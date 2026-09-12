import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF_DIR = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = join(SELF_DIR, 'skills')

export const name = 'rouba-skills-sync'

/**
 * Copy the packaged skills into the user DSH home so the filesystem skill
 * provider discovers them. Existing directories are never overwritten, so a
 * user who edits or replaces a skill keeps their copy across upgrades.
 */
export function apply() {
  try {
    if (!existsSync(SOURCE_DIR)) {
      console.warn('[skills-sync] packaged skills directory is missing:', SOURCE_DIR)
      return
    }
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    const targetDir = join(home, 'skills')
    mkdirSync(targetDir, { recursive: true })

    let copied = 0
    for (const entry of readdirSync(SOURCE_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const destination = join(targetDir, entry.name)
      if (existsSync(destination)) continue
      cpSync(join(SOURCE_DIR, entry.name), destination, { recursive: true })
      copied += 1
      console.log('[skills-sync] installed skill:', entry.name)
    }
    console.log(`[skills-sync] ready (copied=${String(copied)}) at ${targetDir}`)
  } catch (error) {
    // Never block startup because of optional skill provisioning.
    console.error('[skills-sync] failed:', error instanceof Error ? error.message : String(error))
  }
}
