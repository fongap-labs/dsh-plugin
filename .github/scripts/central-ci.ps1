# Trusted Action Worker Windows CI bridge.
# Execute the audited repository test contract without deployment credentials.
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetRoot
)
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $TargetRoot 'scripts/central-ci-windows.mjs'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw 'Missing Delta Desktop Windows CI entrypoint.'
}
& node $scriptPath $TargetRoot
if ($LASTEXITCODE -ne 0) {
    throw "Delta Desktop Windows CI failed with exit code $LASTEXITCODE."
}
