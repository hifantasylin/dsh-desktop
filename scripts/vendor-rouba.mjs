/**
 * Vendor the RoubaAI media plugin packages as pinned tarball artifacts.
 *
 * `@roubaai/*` leaves its own repository through `pnpm pack`, and the desktop
 * repository commits those tarballs under `vendor/rouba/` together with a
 * `manifest.json` recording the source commit and each artifact's SHA-256. The
 * desktop then depends on them by path (`file:vendor/rouba/<name>-<version>.tgz`),
 * so Yarn owns extracting them and its lockfile checksum refuses an artifact
 * that changed under an unchanged name.
 *
 * This replaces copying the sibling repository's working tree into
 * `vendor/rouba/<package>/`: a copied directory is not an artifact boundary, it
 * carries whatever the packager's exclusion list happens to allow, and nothing
 * distinguishes a stale copy from a current one. Two silent staleness failures
 * came from that shape. A tarball is immutable, content-addressed by the
 * manifest, and its own `files` field decides what travels.
 *
 * `--write` packs and rewrites `vendor/rouba/`; `--check` verifies the committed
 * artifacts against the manifest and against the dependencies that consume
 * them, which is what the layout gate runs.
 *
 * Usage: node scripts/vendor-rouba.mjs <--write|--check>
 */

import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '..')
const mode = process.argv[2]

if (mode !== '--write' && mode !== '--check') {
  throw new Error('usage: node scripts/vendor-rouba.mjs <--write|--check>')
}

/**
 * Source workspace holding the plugin packages. Override with
 * `ROUBAAI_MEDIA_ROOT` when the checkout lives somewhere else.
 */
const SOURCE_ROOT = process.env.ROUBAAI_MEDIA_ROOT ?? 'F:\\dsh-dev\\plugins\\roubaai-media'

/** Package directory of that workspace. */
const SOURCE_PACKAGES = join(SOURCE_ROOT, 'packages')

/** Committed artifact directory, holding the tarballs and the manifest. */
const VENDOR = join(root, 'vendor', 'rouba')

/** Manifest recording where the artifacts came from and what they hash to. */
const MANIFEST = join(VENDOR, 'manifest.json')

/** Workspaces that may declare a `@roubaai/*` dependency. */
const CONSUMERS = ['dsh-plugin-desktop', 'dsh-plugin-desktop-beta']

/** Dependency sections that can carry a `file:` path into the vendor tree. */
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies']

const fail = message => {
  throw new Error(`vendor-rouba: ${message}`)
}

/** Print an error line and stop without a stack trace (this runs inside gates). */
const stop = message => {
  process.stderr.write(`vendor-rouba: ${message}\n`)
  process.exit(1)
}

/** SHA-256 of a file, lowercase hex. */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Read one entry out of a gzipped npm tarball without a tar dependency.
 * @param tarball - path to the `.tgz`.
 * @param wanted - entry name, e.g. `package/package.json`.
 * @returns the entry's bytes, or undefined when it is absent.
 */
function tarEntry(tarball, wanted) {
  const buf = gunzipSync(readFileSync(tarball))
  let offset = 0
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '')
    if (name === '') break
    const sizeText = header.subarray(124, 136).toString('utf8').replace(/\0.*$/u, '').trim()
    const size = Number.parseInt(sizeText, 8) || 0
    const body = offset + 512
    if (name === wanted) return buf.subarray(body, body + size)
    offset = body + Math.ceil(size / 512) * 512
  }
  return undefined
}

/** Every entry name inside a gzipped npm tarball. */
function tarEntries(tarball) {
  const buf = gunzipSync(readFileSync(tarball))
  const names = []
  let offset = 0
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '')
    if (name === '') break
    const sizeText = header.subarray(124, 136).toString('utf8').replace(/\0.*$/u, '').trim()
    const size = Number.parseInt(sizeText, 8) || 0
    names.push(name)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return names
}

/**
 * Paths a package's own manifest says a consumer may reach. Every one of them
 * must be inside the packed artifact: an under-declared `files` list would drop
 * a runtime entry (the client half, a patch row) without failing anywhere else.
 * @param manifest - parsed source `package.json`.
 * @returns repo-relative POSIX paths that must exist in the tarball.
 */
function requiredEntries(manifest) {
  const out = new Set(['package.json'])
  const add = value => {
    // A wildcard target (`./src/*`) is a pattern map for source-plane consumers,
    // not a file the artifact has to carry.
    if (typeof value === 'string' && value.startsWith('./') && !value.includes('*')) out.add(value.slice(2))
  }
  add(manifest.main)
  add(manifest.types)
  add(manifest['dsh']?.['bundle']?.['patch'])
  for (const target of Object.values(manifest.exports ?? {})) {
    if (typeof target === 'string') add(target)
    else if (typeof target === 'object' && target !== null) for (const value of Object.values(target)) add(value)
  }
  return [...out].sort()
}

/** Package directory names of the source workspace, sorted. */
function sourcePackages() {
  if (!existsSync(SOURCE_PACKAGES)) fail(`source workspace not found at ${SOURCE_PACKAGES}; set ROUBAAI_MEDIA_ROOT`)
  const names = readdirSync(SOURCE_PACKAGES, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(SOURCE_PACKAGES, entry.name, 'package.json')))
    .map(entry => entry.name)
    .sort()
  if (names.length === 0) fail(`${SOURCE_PACKAGES} holds no package`)
  return names
}

/** The source workspace's recorded provenance. */
function sourceProvenance() {
  const git = args => execFileSync('git', ['-C', SOURCE_ROOT, ...args], { encoding: 'utf8' }).trim()
  let repository = ''
  try {
    repository = git(['config', '--get', 'remote.origin.url'])
  } catch {
    repository = ''
  }
  return {
    repository,
    commit: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain']).length > 0,
  }
}

/** One manifest entry per packed package. */
function packAll() {
  const entries = []
  for (const name of sourcePackages()) {
    const packageDir = join(SOURCE_PACKAGES, name)
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    // A package that was never built would pack sources with no runtime entry
    // and fail later inside the desktop build, where the cause is much harder
    // to see than it is here.
    if (!existsSync(join(packageDir, 'lib', 'index.js'))) {
      fail(`${manifest.name} is not built; run \`pnpm build\` in ${SOURCE_ROOT} first`)
    }
    // One staging directory per package: a shared one would accumulate the
    // earlier tarballs and make "exactly one produced" ambiguous.
    const staging = mkdtempSync(join(tmpdir(), `roubaai-pack-${name}-`))
    const packed = execSync(`pnpm pack --pack-destination "${staging}"`, { cwd: packageDir, encoding: 'utf8' })
    const produced = readdirSync(staging).filter(file => file.endsWith('.tgz'))
    if (produced.length !== 1) fail(`packing ${manifest.name} produced ${produced.length} tarball(s); ${packed}`)
    const tarball = join(staging, produced[0])
    const packedManifest = JSON.parse(tarEntry(tarball, 'package/package.json')?.toString('utf8') ?? 'null')
    if (packedManifest === null) fail(`${produced[0]} carries no package/package.json`)
    // A `file:` consumer outside the source workspace cannot resolve
    // `workspace:` ranges, so an unrewritten range is a broken artifact.
    const ranges = JSON.stringify(packedManifest).match(/workspace:/gu)
    if (ranges !== null) fail(`${produced[0]} still carries ${ranges.length} workspace: range(s); pnpm pack must rewrite them`)
    const entriesInTarball = new Set(tarEntries(tarball).map(entry => entry.replace(/^package\//u, '')))
    const missing = requiredEntries(manifest).filter(entry => !entriesInTarball.has(entry))
    if (missing.length > 0) fail(`${produced[0]} is missing declared entry(s): ${missing.join(', ')}; widen \`files\``)
    entries.push({
      name: packedManifest.name,
      version: packedManifest.version,
      tarball: produced[0],
      sha256: sha256(tarball),
      path: tarball,
    })
  }
  return entries
}

/** Replace `vendor/rouba/` with the freshly packed artifacts and their manifest. */
function writeVendor(entries, provenance) {
  rmSync(VENDOR, { recursive: true, force: true })
  mkdirSync(VENDOR, { recursive: true })
  const packages = []
  for (const entry of entries) {
    copyFileSync(entry.path, join(VENDOR, entry.tarball))
    packages.push({
      name: entry.name,
      version: entry.version,
      tarball: entry.tarball,
      sha256: entry.sha256,
    })
  }
  const manifest = { source: provenance, packages }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

/** Read the committed manifest, or stop with the reason it cannot be used. */
function readManifest() {
  if (!existsSync(MANIFEST)) stop(`vendor/rouba/manifest.json is missing; run \`yarn vendor:rouba\``)
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  } catch (error) {
    stop(`vendor/rouba/manifest.json does not parse: ${error.message}`)
  }
}

/**
 * Compare one artifact against the copy a workspace actually installed.
 *
 * The tarball is the authority; `node_modules` holds what the build packages.
 * A workspace that never installed the packages is skipped — there is nothing
 * to compare — but an installed copy that differs from the artifact is exactly
 * the staleness this layout exists to prevent, so it is reported.
 * @param entry - the manifest entry for one package.
 * @returns drift descriptions, empty when every installed file matches.
 */
function installedDrift(entry) {
  const bare = entry.name.replace(/^@roubaai\//u, '')
  const expected = tarEntries(join(VENDOR, entry.tarball))
    .filter(name => name.startsWith('package/') && !name.endsWith('/'))
    .map(name => name.slice('package/'.length))
  const drift = []
  for (const consumer of CONSUMERS) {
    const installed = join(root, consumer, 'node_modules', '@roubaai', bare)
    if (!existsSync(installed)) continue
    for (const relativePath of expected) {
      const file = join(installed, ...relativePath.split('/'))
      if (!existsSync(file)) {
        drift.push(`${consumer}/node_modules/@roubaai/${bare}/${relativePath} is missing; run \`yarn install\``)
        continue
      }
      if (!readFileSync(file).equals(tarEntry(join(VENDOR, entry.tarball), `package/${relativePath}`))) {
        drift.push(`${consumer}/node_modules/@roubaai/${bare}/${relativePath} differs from ${entry.tarball}; run \`yarn install\``)
      }
    }
  }
  return drift
}

/** Every `@roubaai/*` dependency path a workspace declares. */function declaredDependencies() {
  const out = []
  for (const consumer of CONSUMERS) {
    const path = join(root, consumer, 'package.json')
    if (!existsSync(path)) continue
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    for (const section of DEPENDENCY_SECTIONS) {
      for (const [name, range] of Object.entries(parsed[section] ?? {})) {
        if (name.startsWith('@roubaai/')) out.push({ consumer, name, range })
      }
    }
  }
  return out
}

if (mode === '--write') {
  const provenance = sourceProvenance()
  const manifest = writeVendor(packAll(), provenance)
  for (const entry of manifest.packages) {
    process.stdout.write(`vendor-rouba: ${entry.tarball} (${entry.name}@${entry.version})\n`)
  }
  const dirty = manifest.source.dirty ? ' (source tree dirty)' : ''
  process.stdout.write(
    `vendor-rouba: packed ${manifest.packages.length} artifact(s) from ${manifest.source.commit.slice(0, 12)}${dirty}\n`,
  )
} else {
  const manifest = readManifest()
  const drift = []
  const byName = new Map(manifest.packages.map(entry => [entry.name, entry]))

  for (const entry of manifest.packages) {
    const path = join(VENDOR, entry.tarball)
    if (!existsSync(path)) {
      drift.push(`vendor/rouba/${entry.tarball} is missing`)
      continue
    }
    const actual = sha256(path)
    if (actual !== entry.sha256) drift.push(`vendor/rouba/${entry.tarball} hashes ${actual}, manifest records ${entry.sha256}`)
    drift.push(...installedDrift(entry))
  }

  const strays = readdirSync(VENDOR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || (entry.name !== 'manifest.json' && !entry.name.endsWith('.tgz')))
    .map(entry => entry.name)
  for (const name of strays) drift.push(`vendor/rouba/${name} is not a vendored artifact; the tarball layout holds only *.tgz and manifest.json`)

  for (const { consumer, name, range } of declaredDependencies()) {
    const entry = byName.get(name)
    if (entry === undefined) {
      drift.push(`${consumer} declares ${name} but the manifest has no artifact for it`)
      continue
    }
    // The declaration is relative to the consumer, so only the reach into the
    // artifact directory is fixed: `file:../vendor/rouba/<tarball>`.
    if (!range.startsWith('file:') || !range.endsWith(`vendor/rouba/${entry.tarball}`)) {
      drift.push(`${consumer} declares ${name} as ${range}; expected a file: path ending in vendor/rouba/${entry.tarball}`)
    }
  }

  if (drift.length > 0) {
    for (const line of drift) process.stdout.write(`  ${line}\n`)
    stop(`${drift.length} problem(s); run \`yarn vendor:rouba\` and reinstall`)
  }
  process.stdout.write(
    `vendor-rouba: ${manifest.packages.length} artifact(s) match the manifest (source ${manifest.source.commit.slice(0, 12)}) and every declared @roubaai dependency points at one\n`,
  )
}
