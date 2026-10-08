param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$BaseSha)
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
$taskRoot = Split-Path -Parent $PSScriptRoot
$secretPath = Join-Path $taskRoot '.secrets/opendart-key.dpapi'
if (!(Test-Path -LiteralPath $secretPath)) { throw 'OpenDART key is not configured.' }
$secureKey = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$previousKey = $env:OPENDART_API_KEY
try {
    $env:OPENDART_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    & node (Join-Path $PSScriptRoot 'update-dart-samsung.cjs') --base-sha $BaseSha
    if ($LASTEXITCODE -ne 0) { throw 'Automatic collection failed. Do not publish candidate output.' }
} finally {
    $env:OPENDART_API_KEY = $previousKey
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $secureKey.Dispose()
}
