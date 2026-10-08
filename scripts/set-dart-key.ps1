$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $taskRoot '.secrets'
$secretPath = Join-Path $secretDirectory 'opendart-key.dpapi'
$secureKey = Read-Host 'OpenDART API key (input is hidden)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $keyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ($keyText -notmatch '^[0-9a-fA-F]{40}$') { throw 'Expected a 40-character OpenDART key. Nothing was saved.' }
    New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
    # Windows DPAPI: decryptable by this Windows user, not a plaintext env file.
    ConvertFrom-SecureString $secureKey | Set-Content -LiteralPath $secretPath -Encoding ASCII
    Write-Host 'Key saved encrypted for your Windows account. Its contents were not displayed.'
} finally {
    $keyText = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $secureKey.Dispose()
}
