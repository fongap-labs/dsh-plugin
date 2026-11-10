/**
 * The Host projects volatile fields into the native Plugins configuration form.
 * GitHub tokens are never persisted: only the tokenEnv variable name is stored.
 */
import Schema from '@deepseek-ai/schemastery'

const Account = Schema.object({
  owner: Schema.string().required(),
  tokenEnv: Schema.string().required(),
})
const Server = Schema.object({
  language: Schema.string().required(),
  command: Schema.string().required(),
  args: Schema.array(Schema.string()).default([]),
})

// The native schema resolves Volatile<T> references, while the runtime
// CodeWorkerConfig describes the unwrapped values passed to the tools.
// Keep the exported schema type generic to avoid leaking private inferred
// Schemastery / cosmokit types through the generated declaration.
export const Config: Schema<Record<string, unknown>> = Schema.object({
  enabled: Schema.boolean().default(true).volatile(),
  autoRouting: Schema.boolean().default(true).volatile(),
  workspaceRoot: Schema.string().default('').volatile(),
  git: Schema.object({
    enabled: Schema.boolean().default(true),
    command: Schema.string().default('git'),
  }).volatile(),
  execution: Schema.object({
    allowWorktreeWrites: Schema.boolean().default(false),
    allowCommands: Schema.boolean().default(false),
    fsWriteContract: Schema.string().default('legacy-overwrite'),
  }).volatile(),
  github: Schema.object({
    enabled: Schema.boolean().default(true),
    allowWrites: Schema.boolean().default(false),
    accounts: Schema.array(Account).default([]),
  }).volatile(),
  lsp: Schema.object({
    servers: Schema.array(Server).default([
      { language: 'typescript', command: 'typescript-language-server', args: ['--stdio'] },
      { language: 'javascript', command: 'typescript-language-server', args: ['--stdio'] },
      { language: 'python', command: 'pyright-langserver', args: ['--stdio'] },
      { language: 'rust', command: 'rust-analyzer', args: ['--stdio'] },
      { language: 'go', command: 'gopls', args: ['serve'] },
    ]),
  }).volatile(),
  systemPromptText: Schema.string().default('').volatile(),
})
