<#
.SYNOPSIS
  Release build script for dsh-plugin (per-plugin).
  Called by per-plugin wrapper scripts in packages/<pkg>/build-release.ps1.

.DESCRIPTION
  Invoked with:
    build-release.ps1 -Package <name> -Target <target> -Version <X.Y.Z> -OutputDir <dir>

  1. Temporarily injects -Version into the specified package's package.json (kept at 0.0.0 otherwise).
  2. Resolves a package manager shim (pnpm, then corepack, then npm) and installs with the frozen lockfile.
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
$OriginalPackage = $OriginalText | ConvertFrom-Json
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

# pack-bundles.mjs derives the zip name from the package name without the scope, with '/'
# replaced by '-'. Deriving it from the same source keeps the declared asset and the packed
# file in sync instead of maintaining a name table.
$SafeName = ($OriginalPackage.name -replace '^@', '') -replace '/', '-'

# The release runner provides Node, but a pnpm shim is not guaranteed by the runner image.
# Try pnpm first, then `npm exec` with the version pinned in package.json#packageManager (npm always
# ships with Node), and finally corepack for images where npm is stripped.
$PackageManagerField = (Get-Content -LiteralPath (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json).packageManager
$PnpmVersion = if ($PackageManagerField -match '^pnpm@(.+)$') { $Matches[1] } else { '' }

function Resolve-PackageManager {
  foreach ($shim in @('pnpm.cmd', 'pnpm.exe', 'pnpm')) {
    $found = Get-Command $shim -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
    if ($found) { return @{ Display = 'pnpm'; Command = @($found.Source) } }
  }
  if ($PnpmVersion) {
    foreach ($shim in @('npm.cmd', 'npm.exe', 'npm')) {
      $found = Get-Command $shim -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
      if ($found) {
        return @{
          Display = "npm exec pnpm@$PnpmVersion"
          Command = @($found.Source, 'exec', '--yes', "pnpm@$PnpmVersion", '--')
        }
      }
    }
  }
  foreach ($shim in @('corepack.cmd', 'corepack.exe', 'corepack')) {
    $found = Get-Command $shim -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
    if ($found) { return @{ Display = 'corepack pnpm'; Command = @($found.Source, 'pnpm') } }
  }
  throw 'No package manager found: expected pnpm, npm or corepack on PATH.'
}

function Invoke-PackageManager {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  # pnpm echoes the script it runs to stderr. Windows PowerShell turns redirected native stderr into
  # a terminating error while -ErrorActionPreference is Stop, so the preference is relaxed for the
  # call and the run is judged by its exit code instead.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $pmExe @(@($pmArgs) + @($Arguments)) 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw "pnpm $($Arguments[0]) failed (exit $exitCode)"
  }
}

try {
  # --- 1. Inject the release version into the package.json -------------------
  Write-Host "Injecting version into $PackageDir/package.json..."
  $patched = $OriginalText -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
  [System.IO.File]::WriteAllText($PkgPath, $patched, $Utf8NoBom)
  Write-Host "  $PackageDir -> $Version"

  # --- 2. Resolve the package manager ----------------------------------------
  $packageManager = Resolve-PackageManager
  Write-Host "Using $($packageManager.Display)..."
  $pmExe = $packageManager.Command[0]
  $pmArgs = @($packageManager.Command | Select-Object -Skip 1)

  # --- 3. Install dependencies -----------------------------------------------
  Write-Host 'Installing dependencies...'
  Invoke-PackageManager @('install', '--frozen-lockfile')

  # --- 4. Build all TypeScript packages --------------------------------------
  # Must build all packages because workspace:* resolution needs them all.
  Write-Host 'Building all packages...'
  Invoke-PackageManager @('build')

  # --- 5. Validate and pack the specified bundle -----------------------------
  Write-Host "Packing bundle for $Package..."
  Invoke-PackageManager @('pack:bundles', "--package=$Package")

  # --- 6. Copy zip to OutputDir under the stable asset name ------------------
  if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
  }

  $source = Join-Path $RepoRoot "dist/$SafeName-$Version.zip"
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Expected bundle zip not found: $source"
  }

  $destName = "$SafeName.zip"
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
