<#
.SYNOPSIS
  Per-plugin release build wrapper for dsh-code-worker.
  Called by Action Worker via projects/dsh-code-worker/release.manifest.json.
#>

param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& "$RepoRoot/scripts/build-release.ps1" -Package dsh-code-worker -Target $Target -Version $Version -OutputDir $OutputDir