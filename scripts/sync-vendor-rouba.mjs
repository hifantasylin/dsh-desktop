/**
 * Sync the RoubaAI media plugin packages from their own repository into
 * `vendor/rouba/`, where `dsh-plugin-desktop` consumes them as `file:`
 * dependencies.
 *
 * The packages are developed and built in `roubaai-media`; this repository only
 * carries the artifacts it mounts. A copy is compared by content hash, so
 * `--check` reports drift instead of silently shipping whatever happens to be
 * on disk — the failure mode that let an older build sit under `vendor/rouba`
 * while its source had moved on.
 *
 * Every package the desktop mounts comes from there, the brand occupant set
 * included: the harness checkout this repository is built around is a plain
 * upstream pin and carries no Rouba code.
 *
 * Usage: node scripts/sync-vendor-rouba.mjs <--write|--check>
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mode = process.argv[2]

if (mode !== '--write' && mode !== '--check') {
  throw new Error('usage: node scripts/sync-vendor-rouba.mjs <--write|--check>')
}

/**
 * Packages this repository vendors from `roubaai-media`. Listed in the order a
 * composition mounts them: the seam first, then the backends, the configuration
 * surface, and finally the brand occupants, which declare no `dsh.bundle` and
 * therefore reach a composition as an explicit patch row.
 */
const PACKAGES = ['media', 'media-maizi', 'media-mxapi', 'media-ark', 'settings', 'brand']

/**
 * Source workspace to copy from. Override with `ROUBAAI_MEDIA_SOURCE` when the
 * checkout lives somewhere other than this machine's usual path.
 */
const SOURCE = process.env.ROUBAAI_MEDIA_SOURCE
  ?? 'F:\\dsh-dev\\plugins\\roubaai-media\\packages'

/** Directory under `vendor/` the packages are copied into. */
const VENDOR = join(root, 'vendor', 'rouba')

/** Entries that never travel with a package, however it is consumed. */
const EXCLUDED = new Set(['node_modules'])

/** Suffixes that are build residue rather than shipped content. */
const EXCLUDED_SUFFIXES = ['.tsbuildinfo']

const fail = message => {
  throw new Error(`sync-vendor-rouba: ${message}`)
}

/** Whether one directory entry travels with the package. */
const isShipped = name => !EXCLUDED.has(name) && !EXCLUDED_SUFFIXES.some(suffix => name.endsWith(suffix))

/**
 * Every shipped file under one directory, as source-relative POSIX paths.
 * @param dir - the directory to walk.
 * @param base - the walk root the returned paths are relative to.
 * @returns the sorted relative paths.
 */
function shippedFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!isShipped(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...shippedFiles(full, base))
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join('/'))
  }
  return out.sort()
}

/** Sections of a manifest that can carry a dependency range. */
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** Every sibling package's name and version, for rewriting workspace ranges. */
function siblingVersions() {
  const versions = new Map()
  for (const name of PACKAGES) {
    const manifest = join(SOURCE, name, 'package.json')
    if (!existsSync(manifest)) continue
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    versions.set(parsed.name, parsed.version)
  }
  return versions
}

/**
 * The manifest a consumer outside the source workspace must see.
 *
 * `pnpm pack` rewrites every `workspace:` range to the concrete version of the
 * sibling it points at, and this copy stands in for a packed artifact: a
 * `file:` dependency in another repository cannot resolve `workspace:^`.
 * @param manifest - the source package.json path.
 * @param versions - sibling package name to version.
 * @returns the rewritten manifest text, NUL-free and newline-terminated.
 */
function packedManifest(manifest, versions) {
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const section of DEPENDENCY_SECTIONS) {
    const entries = parsed[section]
    if (typeof entries !== 'object' || entries === null) continue
    for (const [dependency, range] of Object.entries(entries)) {
      if (typeof range !== 'string' || !range.startsWith('workspace:')) continue
      const version = versions.get(dependency)
      if (version === undefined) {
        fail(`${dependency} carries a workspace range but no source package declares it`)
      }
      entries[dependency] = `^${version}`
    }
  }
  return `${JSON.stringify(parsed, null, 2)}\n`
}

/** Copy one package wholesale, replacing whatever the vendor directory held. */
function writePackage(name, versions) {
  const source = join(SOURCE, name)
  const target = join(VENDOR, name)
  rmSync(target, { recursive: true, force: true })
  const files = shippedFiles(source)
  for (const relativePath of files) {
    const destination = join(target, ...relativePath.split('/'))
    mkdirSync(dirname(destination), { recursive: true })
    if (relativePath === 'package.json') {
      writeFileSync(destination, packedManifest(join(source, ...relativePath.split('/')), versions))
    } else {
      copyFileSync(join(source, ...relativePath.split('/')), destination)
    }
  }
  return files.length
}

/**
 * Compare one package's vendored copy against its source.
 * @returns the drift descriptions, empty when the copies agree.
 */
function checkPackage(name, versions) {
  const source = join(SOURCE, name)
  const target = join(VENDOR, name)
  if (!existsSync(target)) return [`vendor/rouba/${name} is missing`]
  const expected = shippedFiles(source)
  const actual = shippedFiles(target)
  const drift = []
  for (const relativePath of expected) {
    if (!actual.includes(relativePath)) {
      drift.push(`vendor/rouba/${name}/${relativePath} is missing`)
      continue
    }
    const sourcePath = join(source, ...relativePath.split('/'))
    const targetPath = join(target, ...relativePath.split('/'))
    // package.json is compared as the packed rewrite, not as the source bytes.
    const expectedContent = relativePath === 'package.json'
      ? packedManifest(sourcePath, versions)
      : readFileSync(sourcePath)
    const actualContent = readFileSync(targetPath)
    const matches = typeof expectedContent === 'string'
      ? expectedContent === actualContent.toString('utf8')
      : expectedContent.equals(actualContent)
    if (!matches) {
      drift.push(`vendor/rouba/${name}/${relativePath} differs from its source`)
    }
  }
  for (const relativePath of actual) {
    if (!expected.includes(relativePath)) drift.push(`vendor/rouba/${name}/${relativePath} is not in the source`)
  }
  return drift
}

if (!existsSync(SOURCE)) {
  fail(`source workspace not found at ${SOURCE}; set ROUBAAI_MEDIA_SOURCE`)
}
if (!statSync(SOURCE).isDirectory()) {
  fail(`source workspace ${SOURCE} is not a directory`)
}

const versions = siblingVersions()

if (mode === '--write') {
  for (const name of PACKAGES) {
    const source = join(SOURCE, name)
    if (!existsSync(source)) fail(`source package ${name} is missing (${source})`)
    // A package that was never built would vendor sources with no runtime
    // artifact, and the desktop build would fail later with a worse message.
    if (!existsSync(join(source, 'lib', 'index.js'))) {
      fail(`${name} is not built; run \`pnpm build\` in ${SOURCE} first`)
    }
    const count = writePackage(name, versions)
    process.stdout.write(`sync-vendor-rouba: wrote vendor/rouba/${name} (${count} files)\n`)
  }
} else {
  const drift = PACKAGES.flatMap(name => checkPackage(name, versions))
  if (drift.length > 0) {
    for (const line of drift) process.stdout.write(`  ${line}\n`)
    fail(`${drift.length} file(s) out of sync; run \`pnpm run vendor:rouba\``)
  }
  process.stdout.write(`sync-vendor-rouba: ${PACKAGES.length} package(s) match their source\n`)
}
