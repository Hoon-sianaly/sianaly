param([ValidateSet('registry','audit','update','acknowledge','reconcile')][string]$Mode='audit',[string]$BaseSha,[switch]$UseCache)
$ErrorActionPreference='Stop'
Import-Module Microsoft.PowerShell.Security
$taskRoot=Split-Path -Parent $PSScriptRoot
$secureKey=(Get-Content -LiteralPath (Join-Path $taskRoot '.secrets/opendart-key.dpapi') -Raw).Trim() | ConvertTo-SecureString
$keyPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$previousKey=$env:OPENDART_API_KEY
try {
 $env:OPENDART_API_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
 $dartArgs=@((Join-Path $PSScriptRoot 'dart-portfolio.cjs'),'--mode',$Mode)
 if($BaseSha){$dartArgs+=@('--base-sha',$BaseSha)}
 if($UseCache){$dartArgs+='--cache'}
 & node @dartArgs
 if($LASTEXITCODE -ne 0){throw 'Portfolio run failed. Do not publish candidate files.'}
}finally {
 $env:OPENDART_API_KEY=$previousKey
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
 $secureKey.Dispose()
}
