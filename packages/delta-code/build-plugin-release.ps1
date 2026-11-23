<#
.SYNOPSIS
  Per-plugin release build wrapper for delta-code.
  Optional PowerShell entry; the current portable release manifest uses build-release.mjs.
#>

param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& "$RepoRoot/scripts/build-release.ps1" -Package delta-code -Target $Target -Version $Version -OutputDir $OutputDir