import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const json = path => JSON.parse(read(path))
const contract = json('projects/architecture.json')
const packages = [...contract.products, ...contract.internal_packages]
const unique = values => assert.equal(new Set(values).size, values.length)

test('workspace package identity, product manifests and capability ownership agree', () => {
  assert.equal(contract.schema_version, 1)
  unique(packages.map(p => p.package))
  unique(packages.flatMap(p => p.capabilities))
  const actual = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(resolve(root, 'packages', e.name, 'package.json')))
    .map(e => 'packages/' + e.name).sort()
  assert.deepEqual(actual, packages.map(p => p.path).sort())
  const releaseProducts = readdirSync(resolve(root, 'projects'), { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(resolve(root, 'projects', e.name, 'release.manifest.json')))
    .map(e => e.name).sort()
  assert.deepEqual(releaseProducts, contract.products.map(p => p.id).sort())
  for (const p of packages) {
    const manifest = json(p.path + '/package.json')
    assert.equal(manifest.name, p.package)
    const dependencyNames = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies,
      ...manifest.peerDependencies, ...manifest.optionalDependencies })
    const internal = dependencyNames.filter(name => packages.some(other => other.package === name))
    assert.deepEqual(internal.sort(), [...p.allowed_workspace_dependencies].sort())
    if (p.architecture) {
      const architecture = json(p.architecture)
      unique(architecture.owners.map(owner => owner.id))
      unique(architecture.owners.flatMap(owner => owner.capabilities))
      assert.equal(json(p.readiness).schema_version, 1)
    }
  }
})

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) yield* sources(path)
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) yield path
  }
}

test('literal source imports respect product boundaries', () => {
  for (const p of packages) {
    for (const path of sources(resolve(root, p.path, 'src'))) {
      const source = readFileSync(path, 'utf8')
      const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)
      for (const [, specifier] of imports) {
        const target = specifier.startsWith('.') ? resolve(dirname(path), specifier) : undefined
        for (const other of packages) {
          if (other === p) continue
          const prefix = resolve(root, other.path)
          if (specifier === other.package || specifier.startsWith(other.package + '/') ||
              target === prefix || target?.startsWith(prefix + sep)) {
            assert.ok(p.allowed_workspace_dependencies.includes(other.package),
              relative(root, path) + ' illegally imports ' + specifier)
          }
        }
      }
    }
  }
})

test('Code domain directories have exactly one declared owner', () => {
  const p = contract.products.find(p => p.id === 'delta-code')
  const architecture = json(p.architecture)
  const declared = architecture.owners.map(owner => owner.path).sort()
  unique(declared)
  const actual = readdirSync(resolve(root, p.path, 'src'), { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('delta-code-'))
    .map(e => p.path + '/src/' + e.name).sort()
  assert.deepEqual(actual, declared)
  for (const path of architecture.legacy_facades) assert.ok(existsSync(resolve(root, p.path, 'src', path)))
})

test('Suite mounted Host feature IDs agree with the MECE contract', () => {
  const architecture = json('projects/delta-suite/architecture-mece.json')
  const source = read('packages/delta-suite/src/delta-suite-composition.ts')
  const registered = Object.fromEntries([...source.matchAll(/registry\.register\(\{\s*id:\s*'([^']+)',\s*owner:\s*'([^']+)'/g)].map(([, id, owner]) => [id, owner]))
  assert.deepEqual(registered, architecture.host_feature_registration)
  for (const owner of Object.values(registered)) assert.ok(architecture.owners.some(o => o.id === owner))
})

test('governance document and machine-contract links are indexed', () => {
  const index = read('docs/README.md')
  for (const path of ['ARCHITECTURE.md', 'ARCHITECTURE_GOVERNANCE.md', 'DEVELOPMENT.md', 'OPERATIONS.md', 'SECURITY.md', 'COMPATIBILITY.md', '../projects/architecture.json']) {
    assert.ok(index.includes('](' + path + ')'), 'missing index link: ' + path)
    assert.ok(existsSync(resolve(root, 'docs', path)))
  }
})
