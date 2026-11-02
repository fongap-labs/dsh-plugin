<#
.SYNOPSIS
  Release build script for dsh-plugin (per-plugin).
  Called by per-plugin wrapper scripts in packages/<pkg>/build-release.ps1.

.DESCRIPTION
  Invoked with:
    build-release.ps1 -Package <name> -Target <target> -Version <X.Y.Z> -OutputDir <dir>

  1. Temporarily injects -Version into the specified package's package.json (kept at 0.0.0 otherwise).
  2. Resolves a working package manager (pnpm, then `npm exec pnpm@<pinned>`, then corepack) and
     installs with the frozen lockfile.
  3. Compiles all TypeScript packages (needed for workspace:* resolution).
  4. Validates and packs the specified bundle zip via pack-bundles.mjs --package <name>.
  5. Copies the produced zip under the stable asset name declared in the manifest into -OutputDir.
  6. Restores the original package.json in a finally block.
#>

param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9]*(?:-[a-z0-9]+)*

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

# Action Worker checks out the source at a pinned revision, so a run started before a fix builds the
# old code and the log carries no trace of it. Record the revision, then a log line always maps back
# to the code that produced it.
function Get-SourceRevision {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $revision = & git rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $revision) { return ([string]$revision).Trim() }
    return 'unknown (git rev-parse HEAD failed)'
  } catch {
    return 'unknown (git is unavailable)'
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

Write-Host "Source revision: $(Get-SourceRevision)"

$PackageDir = "packages/$Package"
$PkgPath = Join-Path $RepoRoot "$PackageDir/package.json"
# Resolve the requested plugin from its actual package manifest instead of a
# static list: newly scaffolded plugins must be independently releasable.
if (-not (Test-Path -LiteralPath $PkgPath -PathType Leaf)) {
  throw "Plugin package not found: $PackageDir"
}
$ManifestPath = Join-Path $RepoRoot "$PackageDir/cordis.patch.yml"
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw "Plugin Bundle patch not found: $ManifestPath"
}

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

# Get-Command returns *every* match on PATH, so reading `.Source` off its result can yield an array:
# the Windows runner ships npm both in the hosted toolcache and under Program Files. Passing such an
# array to the call operator stringifies it into "<path> <path>" and fails as an unknown command
# name. Resolve to exactly one existing file instead.
function Resolve-Executable {
  param([Parameter(Mandatory = $true)][string[]]$Names)
  foreach ($name in $Names) {
    $found = @(Get-Command -Name $name -CommandType Application, ExternalScript -ErrorAction SilentlyContinue)
    foreach ($candidate in $found) {
      $path = if ($candidate.Path) { [string]$candidate.Path } else { [string]$candidate.Source }
      if ([string]::IsNullOrWhiteSpace($path)) { continue }
      if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }
  }
  return $null
}

# A shim can exist and still not work (npm without a reachable registry, corepack without a
# signature), so every candidate answers a cheap `--version` probe before it is trusted. A failure
# keeps the first line of output so the final error explains *why* the candidate was rejected.
function Test-PackageManager {
  param([Parameter(Mandatory = $true)][string]$Executable, [string[]]$Prefix = @())
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(& $Executable @(@($Prefix) + @('--version')) 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  } catch {
    return @{ Ok = $false; Detail = $_.Exception.Message }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -eq 0) { return @{ Ok = $true; Detail = '' } }
  $detail = ($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
  if (-not $detail) { $detail = "exit $exitCode" }
  return @{ Ok = $false; Detail = "exit ${exitCode}: $detail" }
}

function Resolve-PackageManager {
  $candidates = @()
  $pnpmPath = Resolve-Executable @('pnpm.cmd', 'pnpm.exe', 'pnpm')
  if ($pnpmPath) { $candidates += @{ Display = 'pnpm'; Executable = $pnpmPath; Prefix = @() } }
  if ($PnpmVersion) {
    $npmPath = Resolve-Executable @('npm.cmd', 'npm.exe', 'npm')
    if ($npmPath) {
      $candidates += @{
        Display = "npm exec pnpm@$PnpmVersion"
        Executable = $npmPath
        Prefix = @('exec', '--yes', "pnpm@$PnpmVersion", '--')
      }
    }
  }
  $corepackPath = Resolve-Executable @('corepack.cmd', 'corepack.exe', 'corepack')
  if ($corepackPath) {
    $candidates += @{ Display = 'corepack pnpm'; Executable = $corepackPath; Prefix = @('pnpm') }
  }
  if ($candidates.Count -eq 0) {
    throw 'No package manager found: expected pnpm, npm or corepack on PATH.'
  }
  $failures = @()
  foreach ($candidate in $candidates) {
    $probe = Test-PackageManager -Executable $candidate.Executable -Prefix $candidate.Prefix
    if ($probe.Ok) {
      Write-Host "  $($candidate.Display) answered its version probe."
      return $candidate
    }
    Write-Host "  $($candidate.Display) did not answer its version probe ($($probe.Detail)); trying the next candidate."
    $failures += "  - $($candidate.Display) at $($candidate.Executable): $($probe.Detail)"
  }
  throw ("No working package manager found:`n" + ($failures -join "`n"))
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
    throw "$PackageManagerName $($Arguments[0]) failed (exit $exitCode)"
  }
}

try {
  # --- 1. Inject the release version into the package.json -------------------
  Write-Host "Injecting version into $PackageDir/package.json..."
  $patched = $OriginalText -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
  $patched = $patched -replace '"private":\s*true', '"private": false'
  [System.IO.File]::WriteAllText($PkgPath, $patched, $Utf8NoBom)
  Write-Host "  $PackageDir -> $Version"

  # --- 2. Resolve the package manager ----------------------------------------
  $packageManager = Resolve-PackageManager
  Write-Host "Using $($packageManager.Display) ($($packageManager.Executable))..."
  # Keep the executable a single string: an array here becomes "<path> <path>" at the call operator.
  $pmExe = [string]$packageManager.Executable
  $pmArgs = @($packageManager.Prefix)
  $PackageManagerName = [string]$packageManager.Display
  if (-not (Test-Path -LiteralPath $pmExe -PathType Leaf)) {
    throw "Package manager executable not found: $pmExe"
  }

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

  # --- 7. Pack npm tarball (.tgz) and copy under stable asset name -----------
  $tempTgzDir = Join-Path $RepoRoot "dist/tgz-temp"
  if (Test-Path -LiteralPath $tempTgzDir) {
    Remove-Item -LiteralPath $tempTgzDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $tempTgzDir | Out-Null

  Write-Host "Packing npm tarball for $Package..."
  Invoke-PackageManager @('--filter', "./packages/$Package", 'pack', '--pack-destination', $tempTgzDir)

  $packedTgz = Get-ChildItem -LiteralPath $tempTgzDir -Filter "*.tgz" | Select-Object -First 1
  if (-not $packedTgz) {
    throw "Expected npm tarball not produced by pnpm pack in $tempTgzDir"
  }

  $destTgzName = "$SafeName.tgz"
  $destTgz = Join-Path $OutputDir $destTgzName
  Copy-Item -LiteralPath $packedTgz.FullName -Destination $destTgz -Force
  Remove-Item -LiteralPath $tempTgzDir -Recurse -Force
  Write-Host "  -> $destTgzName"
}
finally {
  # Restore original so the checkout stays clean even if a step threw.
  [System.IO.File]::WriteAllText($PkgPath, $OriginalText, $Utf8NoBom)
  Write-Host 'Restored package.json.'
}

Write-Host "Release build $Version complete ($Target / $Package): $OutputDir"
)]
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

# Action Worker checks out the source at a pinned revision, so a run started before a fix builds the
# old code and the log carries no trace of it. Record the revision, then a log line always maps back
# to the code that produced it.
function Get-SourceRevision {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $revision = & git rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $revision) { return ([string]$revision).Trim() }
    return 'unknown (git rev-parse HEAD failed)'
  } catch {
    return 'unknown (git is unavailable)'
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

Write-Host "Source revision: $(Get-SourceRevision)"

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

# Get-Command returns *every* match on PATH, so reading `.Source` off its result can yield an array:
# the Windows runner ships npm both in the hosted toolcache and under Program Files. Passing such an
# array to the call operator stringifies it into "<path> <path>" and fails as an unknown command
# name. Resolve to exactly one existing file instead.
function Resolve-Executable {
  param([Parameter(Mandatory = $true)][string[]]$Names)
  foreach ($name in $Names) {
    $found = @(Get-Command -Name $name -CommandType Application, ExternalScript -ErrorAction SilentlyContinue)
    foreach ($candidate in $found) {
      $path = if ($candidate.Path) { [string]$candidate.Path } else { [string]$candidate.Source }
      if ([string]::IsNullOrWhiteSpace($path)) { continue }
      if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }
  }
  return $null
}

# A shim can exist and still not work (npm without a reachable registry, corepack without a
# signature), so every candidate answers a cheap `--version` probe before it is trusted. A failure
# keeps the first line of output so the final error explains *why* the candidate was rejected.
function Test-PackageManager {
  param([Parameter(Mandatory = $true)][string]$Executable, [string[]]$Prefix = @())
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(& $Executable @(@($Prefix) + @('--version')) 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  } catch {
    return @{ Ok = $false; Detail = $_.Exception.Message }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -eq 0) { return @{ Ok = $true; Detail = '' } }
  $detail = ($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
  if (-not $detail) { $detail = "exit $exitCode" }
  return @{ Ok = $false; Detail = "exit ${exitCode}: $detail" }
}

function Resolve-PackageManager {
  $candidates = @()
  $pnpmPath = Resolve-Executable @('pnpm.cmd', 'pnpm.exe', 'pnpm')
  if ($pnpmPath) { $candidates += @{ Display = 'pnpm'; Executable = $pnpmPath; Prefix = @() } }
  if ($PnpmVersion) {
    $npmPath = Resolve-Executable @('npm.cmd', 'npm.exe', 'npm')
    if ($npmPath) {
      $candidates += @{
        Display = "npm exec pnpm@$PnpmVersion"
        Executable = $npmPath
        Prefix = @('exec', '--yes', "pnpm@$PnpmVersion", '--')
      }
    }
  }
  $corepackPath = Resolve-Executable @('corepack.cmd', 'corepack.exe', 'corepack')
  if ($corepackPath) {
    $candidates += @{ Display = 'corepack pnpm'; Executable = $corepackPath; Prefix = @('pnpm') }
  }
  if ($candidates.Count -eq 0) {
    throw 'No package manager found: expected pnpm, npm or corepack on PATH.'
  }
  $failures = @()
  foreach ($candidate in $candidates) {
    $probe = Test-PackageManager -Executable $candidate.Executable -Prefix $candidate.Prefix
    if ($probe.Ok) {
      Write-Host "  $($candidate.Display) answered its version probe."
      return $candidate
    }
    Write-Host "  $($candidate.Display) did not answer its version probe ($($probe.Detail)); trying the next candidate."
    $failures += "  - $($candidate.Display) at $($candidate.Executable): $($probe.Detail)"
  }
  throw ("No working package manager found:`n" + ($failures -join "`n"))
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
    throw "$PackageManagerName $($Arguments[0]) failed (exit $exitCode)"
  }
}

try {
  # --- 1. Inject the release version into the package.json -------------------
  Write-Host "Injecting version into $PackageDir/package.json..."
  $patched = $OriginalText -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
  $patched = $patched -replace '"private":\s*true', '"private": false'
  [System.IO.File]::WriteAllText($PkgPath, $patched, $Utf8NoBom)
  Write-Host "  $PackageDir -> $Version"

  # --- 2. Resolve the package manager ----------------------------------------
  $packageManager = Resolve-PackageManager
  Write-Host "Using $($packageManager.Display) ($($packageManager.Executable))..."
  # Keep the executable a single string: an array here becomes "<path> <path>" at the call operator.
  $pmExe = [string]$packageManager.Executable
  $pmArgs = @($packageManager.Prefix)
  $PackageManagerName = [string]$packageManager.Display
  if (-not (Test-Path -LiteralPath $pmExe -PathType Leaf)) {
    throw "Package manager executable not found: $pmExe"
  }

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

  # --- 7. Pack npm tarball (.tgz) and copy under stable asset name -----------
  $tempTgzDir = Join-Path $RepoRoot "dist/tgz-temp"
  if (Test-Path -LiteralPath $tempTgzDir) {
    Remove-Item -LiteralPath $tempTgzDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $tempTgzDir | Out-Null

  Write-Host "Packing npm tarball for $Package..."
  Invoke-PackageManager @('--filter', "./packages/$Package", 'pack', '--pack-destination', $tempTgzDir)

  $packedTgz = Get-ChildItem -LiteralPath $tempTgzDir -Filter "*.tgz" | Select-Object -First 1
  if (-not $packedTgz) {
    throw "Expected npm tarball not produced by pnpm pack in $tempTgzDir"
  }

  $destTgzName = "$SafeName.tgz"
  $destTgz = Join-Path $OutputDir $destTgzName
  Copy-Item -LiteralPath $packedTgz.FullName -Destination $destTgz -Force
  Remove-Item -LiteralPath $tempTgzDir -Recurse -Force
  Write-Host "  -> $destTgzName"
}
finally {
  # Restore original so the checkout stays clean even if a step threw.
  [System.IO.File]::WriteAllText($PkgPath, $OriginalText, $Utf8NoBom)
  Write-Host 'Restored package.json.'
}

Write-Host "Release build $Version complete ($Target / $Package): $OutputDir"
