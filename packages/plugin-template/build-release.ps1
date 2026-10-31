<#
.SYNOPSIS
  Per-plugin release build wrapper for plugin-template.
  Called by Action Worker via projects/plugin-template/release.manifest.json.
#>

param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& "$RepoRoot/scripts/build-release.ps1" -Package plugin-template -Target $Target -Version $Version -OutputDir $OutputDir