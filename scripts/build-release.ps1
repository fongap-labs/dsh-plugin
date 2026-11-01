<#
.SYNOPSIS
  Release build script for dsh-plugin (per-plugin).
  Called by per-plugin wrapper scripts in packages/<pkg>/build-release.ps1.

.DESCRIPTION
  Invoked with:
    build-release.ps1 -Package <name> -Target <target> -Version <X.Y.Z> -OutputDir <dir>

  1. Temporarily injects -Version into the specified package's package.json (kept at 0.0.0 otherwise).
  2. Installs dependencies with the frozen lockfile.
  3. Compiles all TypeScript packages (needed for workspace:* resolution).
  4. Validates and packs the specified bundle zip via pack-bundles.mjs --package <name>.
  5. Copies the produced zip under the stable asset name declared in the manifest into -OutputDir.
  6. Restores the original package.json in a finally block.
#>

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dsh-code-worker', 'dsh-ui-delta', 'plugin-template')]
  [string]$Package,

  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+(-beta\.\d+)?$') {
  throw "Invalid version: $Version (expected X.Y.Z or X.Y.Z-beta.N)"
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$PackageDir = "packages/$Package"
$PkgPath = Join-Path $RepoRoot "$PackageDir/package.json"

# Save original package.json bytes so the checkout is left unchanged regardless of outcome.
$OriginalText = [System.IO.File]::ReadAllText($PkgPath)
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

try {
  # --- 1. Inject the release version into the package.json -------------------
  Write-Host "Injecting version into $PackageDir/package.json..."
  $patched = $OriginalText -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
  [System.IO.File]::WriteAllText($PkgPath, $patched, $Utf8NoBom)
  Write-Host "  $PackageDir -> $Version"

  # --- 2. Toolchain: use pnpm directly (already on PATH in CI) ----------------
  Write-Host 'Using pnpm...'
  $pnpm = "pnpm.cmd"

  # --- 3. Install dependencies -----------------------------------------------
  Write-Host 'Installing dependencies...'
  & $pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit $LASTEXITCODE)" }

  # --- 4. Build all TypeScript packages --------------------------------------
  # Must build all packages because workspace:* resolution needs them all.
  Write-Host 'Building all packages...'
  & $pnpm build
  if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit $LASTEXITCODE)" }

  # --- 5. Validate and pack the specified bundle -----------------------------
  Write-Host "Packing bundle for $Package..."
  & $pnpm pack:bundles --package=$Package
  if ($LASTEXITCODE -ne 0) { throw "pnpm pack:bundles failed (exit $LASTEXITCODE)" }

  # --- 6. Copy zip to OutputDir under the stable asset name ------------------
  if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
  }

  # pack-bundles.mjs names zips <safe-name>-<version>.zip, where safe-name is
  # manifest.name without the @ scope and with / replaced by -.
  $SafeNameMap = @{
    'dsh-code-worker'    = "dsh-code-worker"
    'dsh-ui-delta'       = "dsh-ui-delta"
    'plugin-template'    = "dsh-plugin-plugin-template"
  }
  $safeName = $SafeNameMap[$Package]
  $source = Join-Path $RepoRoot "dist/$safeName-$Version.zip"

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Expected bundle zip not found: $source"
  }

  $destName = "$safeName.zip"
  $dest = Join-Path $OutputDir $destName
  Copy-Item -LiteralPath $source -Destination $dest -Force
  Write-Host "  -> $destName"
}
finally {
  # Restore original so the checkout stays clean even if a step threw.
  [System.IO.File]::WriteAllText($PkgPath, $OriginalText, $Utf8NoBom)
  Write-Host 'Restored package.json.'
}

Write-Host "Release build $Version complete ($Target / $Package): $OutputDir"