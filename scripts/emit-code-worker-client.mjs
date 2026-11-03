#!/usr/bin/env node
/**
 * Emit the Code Worker lazy-CJS browser factory with the pinned TypeScript compiler.
 * Browser bundles are classic scripts consumed by DSH ModuleLoader, not ESM modules.
 * The native tsc client project is still checked by the root typecheck command.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'packages/dsh-code-worker/src/client.ts')
const target = resolve(root, 'packages/dsh-code-worker/lib/client.js')
const result = ts.transpileModule(await readFile(source, 'utf8'), {
  fileName: source,
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
    isolatedModules: true,
    removeComments: false,
    sourceMap: false,
  },
})
const errors = (result.diagnostics ?? []).filter(x => x.category === ts.DiagnosticCategory.Error)
if (errors.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }))
}
if (!result.outputText.includes('__ModuleLoader__.load(')) {
  throw new Error('Code Worker client compilation lost its DSH ModuleLoader registration')
}
await mkdir(dirname(target), { recursive: true })
await writeFile(target, result.outputText, 'utf8')
console.log('Emitted native DSH client: packages/dsh-code-worker/lib/client.js')
