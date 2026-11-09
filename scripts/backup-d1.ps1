param([string]$ProjectRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$path=Join-Path $ProjectRoot '.secrets/backup/settings.dpapi'
$credential=[pscredential]::new('backup',((Get-Content -LiteralPath $path -Raw).Trim() | ConvertTo-SecureString))
$config=$credential.GetNetworkCredential().Password | ConvertFrom-Json
try{
 if(!$config.CloudflareToken){throw 'D1 backup connection is not configured.'}
 $recoveryPath=Join-Path $ProjectRoot '.secrets/backup/recovery-key.dpapi'
 $recoveryKey=$null
 if(Test-Path -LiteralPath $recoveryPath){$keyCredential=[pscredential]::new('recovery',((Get-Content -LiteralPath $recoveryPath -Raw).Trim() | ConvertTo-SecureString));$recoveryKey=$keyCredential.GetNetworkCredential().Password}
 @{CloudflareToken=$config.CloudflareToken;BackupPassword=$config.BackupPassword;RecoveryPrivateKey=$recoveryKey} | ConvertTo-Json -Compress | & node (Join-Path $ProjectRoot 'scripts/backup-d1.mjs')
 if($LASTEXITCODE -ne 0){throw 'D1 backup did not complete.'}
 & (Join-Path $PSScriptRoot 'expire-local-backups.ps1') -ProjectRoot $ProjectRoot -Apply
}finally{$config=$null;$credential=$null;$keyCredential=$null;$recoveryKey=$null}
