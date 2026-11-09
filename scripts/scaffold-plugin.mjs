#!/usr/bin/env node
/**
 * Create a complete Host plugin and its Action Worker release manifest from
 * the tracked plugin-template. No user-specific paths or duplicated IDs.
 *
 * Usage: node scripts/scaffold-plugin.mjs --name plugin-example
 *        node scripts/scaffold-plugin.mjs --name plugin-example --description "..."
 *        node scripts/scaffold-plugin.mjs --name plugin-example --dry-run
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before)
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one ${label} placeholder in template`)
  }
  return text.replace(before, after)
}

/** Generate two matching products, or leave the workspace untouched on error. */
export function scaffoldPlugin({ name: slug, description, root = ROOT, dryRun = false }) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug) || slug === 'plugin-template') {
    throw new Error('Plugin name must be a new lowercase kebab-case slug (e.g. plugin-example)')
  }
  const templateDir = join(root, 'packages', 'plugin-template')
  const templateProject = join(root, 'projects', 'plugin-template', 'release.manifest.json')
  const targetDir = join(root, 'packages', slug)
  const targetProjectDir = join(root, 'projects', slug)
  if (!existsSync(join(templateDir, 'package.json')) || !existsSync(templateProject)) {
    throw new Error('plugin-template package and release manifest must exist')
  }
  if (existsSync(targetDir) || existsSync(targetProjectDir)) {
    throw new Error(`Plugin ${slug} already exists; refusing to overwrite files`)
  }

  const source = readJson(join(templateDir, 'package.json'))
  const sourceName = source.name
  const sourceSlug = basename(templateDir)
  if (typeof sourceName !== 'string' || !sourceName.includes('/')) {
    throw new Error('Template package name must be a scoped npm name')
  }
  const scope = sourceName.slice(0, sourceName.lastIndexOf('/'))
  const packageName = `${scope}/${slug}`
  const npmAssetName = packageName.replace(/^@/, '').replaceAll('/', '-')
  const manifest = readJson(templateProject)
  if (dryRun) return { packageName, targetDir, targetProjectDir, releaseKey: slug }

  let isCopied = false
  try {
    // Avoid copying generated files left by a previous pnpm build into the new source.
    cpSync(templateDir, targetDir, {
      recursive: true,
      filter: (path) => {
        const part = relative(templateDir, path).split(sep)
        return !part.some((segment) => ['node_modules', 'lib', 'dist'].includes(segment))
      },
    })
    isCopied = true
    mkdirSync(targetProjectDir, { recursive: true })

    source.name = packageName
    source.description = typeof description === 'string' && description.trim()
      ? description.trim() : `DeepSeek Harness Host plugin: ${slug}`
    writeJson(join(targetDir, 'package.json'), source)

    const patchPath = join(targetDir, 'cordis.patch.yml')
    let patch = readFileSync(patchPath, 'utf8').replace(/\r\n/g, '\n')
    patch = replaceOnce(patch, `- id: ${sourceSlug}\n`, `- id: ${slug}\n`, 'patch id')
    patch = replaceOnce(patch, `name: '${sourceName}'`, `name: '${packageName}'`, 'patch name')
    writeFileSync(patchPath, patch.replace('plugin-template Bundle Patch', `${slug} Bundle Patch`))

    const sourcePath = join(targetDir, 'src', 'index.ts')
    const sourceCode = readFileSync(sourcePath, 'utf8')
    writeFileSync(sourcePath, replaceOnce(
      sourceCode, `export const name = '${sourceName}'`,
      `export const name = '${packageName}'`, 'Host plugin name',
    ))

    const wrapperPath = join(targetDir, 'build-release.mjs')
    let wrapper = readFileSync(wrapperPath, 'utf8')
    wrapper = replaceOnce(wrapper, `'--package', '${sourceSlug}'`, `'--package', '${slug}'`, 'release package')
    writeFileSync(wrapperPath, wrapper)
    // Do not copy the legacy wrapper with the template's stale plugin identity.
    rmSync(join(targetDir, 'build-release.ps1'), { force: true })

    for (const locale of ['en', 'zh']) {
      const path = join(targetDir, 'locale', `${locale}.json`)
      const data = readJson(path)
      data.meta.title = slug
      data.meta.description = source.description
      writeJson(path, data)
    }

    const updatedManifest = {
      ...manifest,
      artifact_name: `${slug}-release`,
      release_key: slug,
      release_name: slug,
      license_expression: source.license,
      sbom_asset: `${slug}-sbom.cdx.json`,
      builds: manifest.builds.map((build) => ({
        ...build,
        script: `${slug}/build-release.mjs`,
        assets: build.assets.map((asset) => {
          const ext = asset.endsWith('.zip') ? '.zip' : asset.endsWith('.tgz') ? '.tgz' : null
          if (!ext) throw new Error(`Unrecognized template release asset: ${asset}`)
          return `${npmAssetName}${ext}`
        }),
        attest_asset: `${npmAssetName}.zip`,
      })),
    }
    writeJson(join(targetProjectDir, 'release.manifest.json'), updatedManifest)
    writeFileSync(join(targetDir, 'README.md'),
      `# ${packageName}\n\n${source.description}\n\n` +
      `Generated from the repository's plugin-template. Replace the sample greeting tool\n` +
      `and optional prompt with real plugin behavior before publishing.\n\n` +
      `## Local validation\n\n` +
      `\`\`\`bash\npnpm install --frozen-lockfile\npnpm build\npnpm test\npnpm validate\npnpm link:dev ${slug}\n\`\`\`\n\n` +
      `The bundle uses ${packageName} and the separate ${slug} release manifest.\n`,
    )
    return { packageName, targetDir, targetProjectDir, releaseKey: slug }
  } catch (error) {
    if (isCopied) rmSync(targetDir, { recursive: true, force: true })
    if (existsSync(targetProjectDir)) rmSync(targetProjectDir, { recursive: true, force: true })
    throw error
  }
}

function parseArgs(args) {
  const options = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--name' || arg === '--description') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} requires a value`)
      options[arg.slice(2)] = args[++i]
    } else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCLI) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      console.log('Usage: node scripts/scaffold-plugin.mjs --name <slug> [--description <text>] [--dry-run]')
    } else {
      const generated = scaffoldPlugin(options)
      console.log(`${options.dryRun ? 'Would create' : 'Created'} ${generated.packageName}`)
      console.log(`  package: ${generated.targetDir}\n  release: ${generated.targetProjectDir}`)
    }
  } catch (error) {
    console.error(`scaffold-plugin: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
