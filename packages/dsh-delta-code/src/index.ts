/**
 * DeepSeek Harness Code Worker Host plugin. Tool implementations are separated
 * by responsibility; plugin identity, Cordis registration and cleanup stay here.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { registerTool } from '@fongap-labs/shared'
import type { CodeWorkerConfig, Settings } from './types.js'
export { Config } from './config.js'
import { DEFAULT_GUIDANCE, errorMessage, normalizeConfig } from './runtime.js'
import { createMultiEditTool } from './tools/multi-edit.js'
import { createGitStatusTool, createGitDiffTool } from './tools/git.js'
import { createLspProbeTool } from './tools/lsp.js'
import { createWorkspaceMapTool } from './tools/workspace.js'
import { createWorktreeTool } from './tools/worktree.js'
import { createVerifyTool } from './tools/verify.js'
import { createVerifySuiteTool } from './tools/verify-suite.js'
import { createDeliveryGateTool } from './tools/delivery-gate.js'
import { createNativeResumeTool, registerNativeResume, type NativeResumeReader } from './tools/resume.js'
import { createGitHubTools } from './tools/github.js'
import { createProjectProfileTool } from './tools/profile.js'
import { createHostProbeTool } from './tools/host-probe.js'
import { createWorkflowRouteTool } from './workflow-route.js'
import { registerCodingSkills } from './skills.js'
import { registerAutomaticCodingRouter } from './auto-routing.js'

export type { CodeWorkerConfig, GitHubAccountConfig, LspServerConfig } from './types.js'
const PROMPT_SECTION_NAME = 'dsh-delta-code:guidance'
export const name = '@fongap-labs/dsh-delta-code'
// Both services are required for the plugin's Git, search and verification tools.
// Cordis forbids undeclared ctx.subprocess reads during tool execution.
export const inject = ['tools', 'subprocess']

export function apply(ctx: Context, config?: CodeWorkerConfig): () => void {
  let settings = normalizeConfig(config)
  const toolDisposers: Array<() => void> = []
  const promptDisposers: Array<() => void> = []
  const cleanup: Array<() => void> = []
  const nativeResume = registerNativeResume(ctx)
  cleanup.push(() => nativeResume.dispose())

  const register = () => {
    for (const tool of createTools(ctx, settings, nativeResume)) {
    const result = registerTool(ctx, tool)
    if (result.registered && typeof result.disposer === 'function') {
      toolDisposers.push(result.disposer)
    } else if (result.error) {
      ctx.logger?.warn?.(
        `dsh-delta-code: tool "${tool.name}" was not registered: ${result.error.message}`,
      )
    }
    }
  }
  // Hot changes replace tool definitions; unload the old registrations first.
  // Snapshot the configuration for each tool generation.
  if (typeof (ctx as any).on === 'function') {
    const unsubscribe = (ctx as any).on('loader/volatile-update', () => {
      for (const disposer of toolDisposers.splice(0)) { try { disposer() } catch {} }
      settings = normalizeConfig(config)
      register()
    })
    // Cordis events usually return an unsubscribe callback.
    if (typeof unsubscribe === 'function') cleanup.push(unsubscribe)
  }
  register()
  cleanup.push(registerCodingSkills(ctx))
  cleanup.push(registerAutomaticCodingRouter(ctx, () => settings))

  ctx.inject(['systemPrompt'], (child) => {
    try {
      const order = child.systemPrompt?.getSectionOrder('TOOL_EDIT')
      const disposer = child.systemPrompt?.section({
        name: PROMPT_SECTION_NAME,
        order: Number.isFinite(order) ? (order as number) : 1300,
        text: settings.systemPromptText || DEFAULT_GUIDANCE,
      })
      if (typeof disposer === 'function') promptDisposers.push(disposer)
    } catch (error) {
      ctx.logger?.warn?.(
        `dsh-delta-code: failed to register system prompt section: ${errorMessage(error)}`,
      )
    }
  })

  return () => {
    for (const dispose of cleanup) { try { dispose() } catch {} }
    for (let i = promptDisposers.length - 1; i >= 0; i -= 1) {
      try { promptDisposers[i]!() } catch {}
    }
    for (let i = toolDisposers.length - 1; i >= 0; i -= 1) {
      try {
        toolDisposers[i]!()
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

function createTools(ctx: Context, settings: Settings, nativeResume: NativeResumeReader): ToolDefinition[] {
  if (settings.enabled === false) return []

  const tools: ToolDefinition[] = [
    createMultiEditTool(ctx, settings),
    createProjectProfileTool(ctx, settings),
    createHostProbeTool(ctx),
    createWorkflowRouteTool(),
    createWorkspaceMapTool(ctx, settings),
    createWorktreeTool(ctx, settings),
    createVerifyTool(ctx, settings),
    createVerifySuiteTool(ctx, settings),
    createDeliveryGateTool(ctx, settings),
    createNativeResumeTool(ctx, settings, nativeResume),
  ]
  if (settings.gitEnabled) {
    tools.push(createGitStatusTool(ctx, settings))
    tools.push(createGitDiffTool(ctx, settings))
  }
  if (settings.githubEnabled) tools.push(...createGitHubTools(ctx, settings))
  tools.push(createLspProbeTool(ctx, settings))
  return tools
}

