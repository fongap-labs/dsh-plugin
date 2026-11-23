import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../../../types.js'
import type { NativeResumeReader } from '../../../delta-code-quality/resume-policy.js'
import type { DeltaGitHubTransport } from '../../contracts/github.js'
import { createMultiEditTool } from './multi-edit.js'
import { createProjectProfileTool } from './profile.js'
import { createHostProbeTool } from './host-probe.js'
import { createModernWebGuidanceTool } from './modern-web-guidance.js'
import { createLspProbeTool } from './lsp.js'
import { createVerifyTool } from './verify.js'
import { createVerifySuiteTool } from './verify-suite.js'
import { createDeliveryGateTool } from './delivery-gate.js'
import { createNativeResumeTool } from './resume.js'
import { createWorkspaceMapTool } from './workspace.js'
import { createSessionRepositoryTool } from './session-repositories.js'
import type { NativeSessionRepositoryReader } from './session-repository-projection.js'
import { createWorktreeTool } from './worktree.js'
import { createGitStatusTool, createGitDiffTool } from './git.js'
import { createGitHubTools } from './github.js'

/** DSH-specific factories. The feature modules never import Context or ToolDefinition. */
export function createDshCodingCoreTools(
  ctx: Context, settings: Settings, sessionRepositories?: NativeSessionRepositoryReader,
): ToolDefinition[] {
  return [createMultiEditTool(ctx, settings, sessionRepositories), createProjectProfileTool(ctx, settings),
    createHostProbeTool(ctx), createModernWebGuidanceTool()]
}

export function createDshCodingCommandTools(ctx: Context, settings: Settings): ToolDefinition[] {
  return [createLspProbeTool(ctx, settings)]
}

export function createDshQualityTools(
  ctx: Context, settings: Settings, resume: NativeResumeReader,
  sessionRepositories?: NativeSessionRepositoryReader,
): ToolDefinition[] {
  return [createVerifyTool(ctx, settings, sessionRepositories), createVerifySuiteTool(ctx, settings, sessionRepositories),
    createDeliveryGateTool(ctx, settings, resume), createNativeResumeTool(ctx, settings, resume)]
}

export function createDshRepositoryRemoteTools(
  ctx: Context, settings: Settings, github: DeltaGitHubTransport,
): ToolDefinition[] {
  return settings.githubEnabled ? createGitHubTools(ctx, settings, github) : []
}

export function createDshRepositoryCommandTools(
  ctx: Context, settings: Settings, sessionRepositories?: NativeSessionRepositoryReader,
): ToolDefinition[] {
  return [createWorkspaceMapTool(ctx, settings, sessionRepositories), createWorktreeTool(ctx, settings),
    ...(settings.gitEnabled ? [createGitStatusTool(ctx, settings, sessionRepositories), createGitDiffTool(ctx, settings, sessionRepositories),
      ...(sessionRepositories ? [createSessionRepositoryTool(ctx, settings, sessionRepositories)] : [])] : [])]
}
