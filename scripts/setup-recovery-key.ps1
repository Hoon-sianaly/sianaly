param([string]$ProjectRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$privateRoot=Join-Path $ProjectRoot '.secrets/backup'
$target=Join-Path $privateRoot 'recovery-key.dpapi'
if(Test-Path -LiteralPath $target){throw 'Recovery key already exists. Rotation requires preserving the old key.'}
$credential=[pscredential]::new('backup',((Get-Content -LiteralPath (Join-Path $privateRoot 'settings.dpapi') -Raw).Trim() | ConvertTo-SecureString))
$settings=$credential.GetNetworkCredential().Password | ConvertFrom-Json
$rsa=[Security.Cryptography.RSA]::Create(3072)
try{
 $private=$rsa.ExportPkcs8PrivateKeyPem()
 $public=$rsa.ExportSubjectPublicKeyInfoPem()
 $protected=ConvertFrom-SecureString (ConvertTo-SecureString $private -AsPlainText -Force)
 [IO.File]::WriteAllText($target,$protected)
 # JSON quoting produces valid JS and avoids PEM/template interpolation ambiguity.
 $module='// Public encryption key only. Private key is encrypted locally.'+"`nexport const RECOVERY_PUBLIC_KEY = "+(ConvertTo-Json $public -Compress)+";`n"
 [IO.File]::WriteAllText((Join-Path $ProjectRoot 'scripts/recovery-public-key.mjs'),$module)
 # The portable copy uses the existing backup passphrase, not Windows-only DPAPI.
 $sealedKeyInput=@{password=$settings.BackupPassword;privateKey=$private} | ConvertTo-Json -Compress
 $sealedKeyInput | & node (Join-Path $ProjectRoot 'scripts/seal-recovery-key.mjs')
 if($LASTEXITCODE -ne 0){throw 'Portable recovery key archive creation failed. Keep the DPAPI key.'}
 Write-Output 'Recovery public key prepared; private key saved with DPAPI and portable backup encryption.'
}finally{$rsa.Dispose();$private=$null;$settings=$null;$sealedKeyInput=$null;$credential=$null}
