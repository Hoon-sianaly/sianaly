param([int]$Year = 2025, [ValidateSet('11011','11012','11013','11014')][string]$Report = '11011')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$secretPath = Join-Path $taskRoot '.secrets/opendart-key.dpapi'
if (!(Test-Path -LiteralPath $secretPath)) { throw 'Run scripts/set-dart-key.ps1 first.' }
$secureKey = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$previousKey = $env:OPENDART_API_KEY
try {
    $env:OPENDART_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    & node (Join-Path $PSScriptRoot 'dart-samsung.cjs') --year $Year --report $Report
    if ($LASTEXITCODE -ne 0) { throw 'DART check failed. Existing website data was not changed.' }
} finally {
    $env:OPENDART_API_KEY = $previousKey
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $secureKey.Dispose()
}
