/**
 * Disable Spectre mitigation in node-gyp's MSVS project generator.
 *
 * Electron rebuilds native modules (node-pty, koffi…) through @electron/rebuild.
 * node-gyp writes `<SpectreMitigation>Spectre</SpectreMitigation>` into every
 * generated .vcxproj, and MSBuild then fails with MSB8040 unless the matching
 * "Spectre-mitigated libs" component is installed in Visual Studio:
 *
 *   error MSB8040: 此项目需要缓解了 Spectre 漏洞的库
 *
 * Patching the generated .vcxproj files does not help: node-gyp regenerates them
 * on every rebuild. This script patches the generator itself so the property is
 * never emitted.
 *
 * Run it after every dependency install (`yarn install`) and before packaging.
 * Delete it once the Visual Studio Spectre-mitigated libraries are installed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const GENERATOR_RELATIVE = join('gyp', 'pylib', 'gyp', 'generator', 'msvs.py')
const SOURCE = 'spectre_mitigation = msbuild_attributes.get("SpectreMitigation")'
const REPLACEMENT = 'spectre_mitigation = None'

const CANDIDATES = [
  join(PACKAGE_ROOT, 'node_modules', '@electron', 'rebuild', 'node_modules', 'node-gyp', GENERATOR_RELATIVE),
  join(PACKAGE_ROOT, 'node_modules', 'node-gyp', GENERATOR_RELATIVE),
  join(PACKAGE_ROOT, 'node_modules', 'pnpm', 'dist', 'node_modules', 'node-gyp', GENERATOR_RELATIVE),
]

let patched = 0
for (const file of CANDIDATES) {
  if (!existsSync(file)) continue
  const contents = readFileSync(file, 'utf8')
  if (!contents.includes(SOURCE)) continue
  writeFileSync(file, contents.replaceAll(SOURCE, REPLACEMENT))
  patched += 1
  console.log(`[patch-node-gyp-spectre] patched ${file}`)
}

console.log(`[patch-node-gyp-spectre] done (patched=${String(patched)})`)
