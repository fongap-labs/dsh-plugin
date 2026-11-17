import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { createWorkspaceMapTool } from './workspace.js'
import { createWorktreeTool } from './worktree.js'
import { createGitStatusTool, createGitDiffTool } from './git.js'
import { createGitHubTools } from './github.js'
import type { DeltaGitHubTransport } from '../delta-code-adapter/contracts/github.js'

/** Explicit GitHub remote calls need no local subprocess. */
export function deltaCodeRepositoryRemote(ctx: Context, settings: Settings, github: DeltaGitHubTransport): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-repository-remote',
    tools: settings.githubEnabled ? createGitHubTools(ctx, settings, github) : [],
  }
}

/** Only local repository operations depend on subprocess. */
export function deltaCodeRepositoryCommands(ctx: Context, settings: Settings): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-repository-commands',
    tools: [
      createWorkspaceMapTool(ctx, settings),
      createWorktreeTool(ctx, settings),
      ...(settings.gitEnabled ? [createGitStatusTool(ctx, settings), createGitDiffTool(ctx, settings)] : []),
    ],
  }
}

/** Compatibility factory for the original complete Repository feature. */
export function deltaCodeRepository(ctx: Context, settings: Settings, github: DeltaGitHubTransport): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-repository',
    tools: [
      ...(deltaCodeRepositoryCommands(ctx, settings).tools ?? []),
      ...(deltaCodeRepositoryRemote(ctx, settings, github).tools ?? []),
    ],
  }
}
