/**
 * DSH native Bundle scaffold template (Host Plugin).
 *
 * Copy this directory to create a new plugin:
 * 1. Update `name`, `description` and `files` in package.json.
 * 2. Update `id` and `name` in cordis.patch.yml (matching the package name).
 * 3. Replace `meta.title` and `meta.description` in locale/en.json and zh.json.
 * 4. Replace icon.svg with an original or redistributable icon (<= 256 KiB).
 * 5. Implement `apply(ctx, config)` in this file and register tools there with
 *    @dsh-plugin/shared.
 */

import type { Context } from '@deepseek-ai/cordis'

import {
  defineTool,
  registerTool,
  resolveInside,
} from '@dsh-plugin/shared'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional host prompt service; the guidance section is skipped without it. */
    systemPrompt?: TemplateSystemPromptService
  }
}

/** Prompt section registration accepted by the host `systemPrompt` service. */
interface TemplatePromptSectionSpec {
  name: string
  order: number
  text: string
}

/** The subset of the host `systemPrompt` service this template relies on. */
interface TemplateSystemPromptService {
  section(spec: TemplatePromptSectionSpec): (() => void) | undefined
}

/** Plugin configuration as accepted from the Cordis patch file. */
export interface TemplateConfig {
  enabled?: boolean
  greeting?: string
}

export const name = 'plugin-template'
export const inject = ['tools']

export function apply(ctx: Context, config?: TemplateConfig): () => void {
  const settings: TemplateConfig = config && typeof config === 'object' ? config : {}
  const disposers: Array<() => void> = []

  // `resolveInside` is kept in the import list on purpose: every real plugin
  // must route user-supplied paths through it before touching the filesystem.
  void resolveInside

  if (settings.enabled !== false) {
    const tool = defineTool({
      name: 'template_greet',
      description: '返回配置的 greeting 文本（演示用工具）。',
      parameters: { name: { type: 'string', required: true, description: '要问候的名字。' } },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { text: { type: 'string', required: true } },
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args) {
        const greeting = typeof settings.greeting === 'string' ? settings.greeting : 'hello'
        return { text: `${greeting}, ${args.name}!` }
      },
    })
    const result = registerTool(ctx, tool)
    if (result.registered && typeof result.disposer === 'function') {
      disposers.push(result.disposer)
    }
  }

  ctx.inject(['systemPrompt'], (child) => {
    try {
      const disposer = child.systemPrompt?.section({
        name: 'template:guidance',
        order: 1300,
        text: '这是一个模板插件，请在实际插件中替换此提示文本。',
      })
      if (typeof disposer === 'function') disposers.push(disposer)
    } catch { /* host prompt service is optional */ }
  })

  return () => {
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try { disposers[i]!() } catch { /* best-effort cleanup */ }
    }
  }
}
