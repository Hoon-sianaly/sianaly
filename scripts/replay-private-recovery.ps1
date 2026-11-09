param([Parameter(Mandatory)][string]$JournalArchive,[Parameter(Mandatory)][string]$RestoredSqlite,[Parameter(Mandatory)][string]$BackupStartedAt,[Parameter(Mandatory)][securestring]$LocalDatabasePassword)
$ErrorActionPreference='Stop'
$privateRoot=Join-Path (Split-Path $PSScriptRoot -Parent) '.secrets/backup'
$settingsCredential=[pscredential]::new('backup',((Get-Content -LiteralPath (Join-Path $privateRoot 'settings.dpapi') -Raw).Trim() | ConvertTo-SecureString))
$settings=$settingsCredential.GetNetworkCredential().Password | ConvertFrom-Json
$keyCredential=[pscredential]::new('recovery',((Get-Content -LiteralPath (Join-Path $privateRoot 'recovery-key.dpapi') -Raw).Trim() | ConvertTo-SecureString))
$localCredential=[pscredential]::new('restore',$LocalDatabasePassword)
try{
 @{password=$settings.BackupPassword;privateKey=$keyCredential.GetNetworkCredential().Password;localDatabasePassword=$localCredential.GetNetworkCredential().Password} | ConvertTo-Json -Compress | & node (Join-Path $PSScriptRoot 'replay-private-recovery.mjs') $JournalArchive $RestoredSqlite $BackupStartedAt
 if($LASTEXITCODE -ne 0){throw 'Privacy recovery gate did not pass; restored service must stay offline.'}
}finally{$settings=$null;$settingsCredential=$null;$keyCredential=$null;$localCredential=$null}
