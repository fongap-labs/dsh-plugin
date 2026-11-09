<#
.SYNOPSIS
  Per-plugin release build wrapper for dsh-delta-code.
  Called by Action Worker via projects/dsh-delta-code/release.manifest.json.
#>

param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& "$RepoRoot/scripts/build-release.ps1" -Package dsh-delta-code -Target $Target -Version $Version -OutputDir $OutputDir