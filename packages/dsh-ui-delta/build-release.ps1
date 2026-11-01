<#
.SYNOPSIS
  Per-plugin release build wrapper for dsh-ui-delta.
  Called by Action Worker via projects/dsh-ui-delta/release.manifest.json.
#>

param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& "$RepoRoot/scripts/build-release.ps1" -Package dsh-ui-delta -Target $Target -Version $Version -OutputDir $OutputDir