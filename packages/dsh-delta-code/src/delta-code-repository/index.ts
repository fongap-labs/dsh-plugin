import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { createWorkspaceMapTool } from './workspace.js'
import { createWorktreeTool } from './worktree.js'
import { createGitStatusTool, createGitDiffTool } from './git.js'
import { createGitHubTools } from './github.js'

export function deltaCodeRepository(ctx: Context, settings: Settings): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-repository',
    tools: [
      createWorkspaceMapTool(ctx, settings),
      createWorktreeTool(ctx, settings),
      ...(settings.gitEnabled ? [createGitStatusTool(ctx, settings), createGitDiffTool(ctx, settings)] : []),
      ...(settings.githubEnabled ? createGitHubTools(ctx, settings) : []),
    ],
  }
}
