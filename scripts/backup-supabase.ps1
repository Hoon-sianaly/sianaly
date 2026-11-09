param([string]$ProjectRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$ProjectRoot=[IO.Path]::GetFullPath($ProjectRoot)
$privateRoot=Join-Path $ProjectRoot '.secrets/backup'
$settingsPath=Join-Path $privateRoot 'settings.dpapi'
if(!(Test-Path -LiteralPath $settingsPath)){throw 'Enter local backup settings first.'}
$credential=[pscredential]::new('backup',((Get-Content -LiteralPath $settingsPath -Raw).Trim() | ConvertTo-SecureString))
$settings=$credential.GetNetworkCredential().Password | ConvertFrom-Json
$credential=$null
$pgBin=Join-Path $ProjectRoot 'tmp/backup-tools/postgresql17/pgsql/bin'
if(!(Test-Path -LiteralPath (Join-Path $pgBin 'pg_dump.exe'))){throw 'PostgreSQL 17 backup tools are missing.'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$work=Join-Path $privateRoot ('capture-'+$stamp)
New-Item -ItemType Directory -Path $work | Out-Null
$archiveRoot=Join-Path $ProjectRoot 'backups'
New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
$archive=Join-Path $archiveRoot ('sianaly-supabase-'+$stamp+'.sianaly-backup')
$nativeLog=Join-Path $privateRoot ('capture-'+$stamp+'.log')
$oldEnvironment=@{}
foreach($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT','PGAPPNAME','PGOPTIONS','PGCONNECT_TIMEOUT')){$oldEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 # Use the Windows trust store as libpq's CA bundle; never downgrade TLS verification.
 $caPath=Join-Path $privateRoot 'windows-root-ca.pem'
 $pem=[Text.StringBuilder]::new()
 foreach($location in @('LocalMachine','CurrentUser')){
  $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root',$location)
  $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
  try{foreach($cert in $store.Certificates){[void]$pem.AppendLine('-----BEGIN CERTIFICATE-----');[void]$pem.AppendLine([Convert]::ToBase64String($cert.RawData,[Base64FormattingOptions]::InsertLineBreaks));[void]$pem.AppendLine('-----END CERTIFICATE-----')}}finally{$store.Close()}
 }
 $supabaseCa=Join-Path $privateRoot 'supabase-root-ca.pem'
 if(!(Test-Path -LiteralPath $supabaseCa)){throw 'Download the official Supabase CA certificate from Database Settings first.'}
 [void]$pem.AppendLine([IO.File]::ReadAllText($supabaseCa))
 [IO.File]::WriteAllText($caPath,$pem.ToString())
 $env:PGHOST=$settings.HostName;$env:PGPORT=[string]$settings.Port;$env:PGDATABASE=$settings.Database;$env:PGUSER=$settings.UserName
 $env:PGPASSWORD=$settings.DatabasePassword;$env:PGSSLMODE='verify-full';$env:PGSSLROOTCERT=$caPath;$env:PGAPPNAME='sianaly-readonly-backup';$env:PGOPTIONS='-c default_transaction_read_only=on';$env:PGCONNECT_TIMEOUT='15'
 $pgDump=Join-Path $pgBin 'pg_dump.exe';$psql=Join-Path $pgBin 'psql.exe'
 # One pg_dump snapshot includes auth records, public RLS/ACLs and internal departure trigger.
 & $pgDump '--format=custom' '--schema=auth' '--schema=public' '--schema=sianaly_internal' '--no-password' '--lock-wait-timeout=5000' ('--file='+ (Join-Path $work 'supabase.dump')) 2> $nativeLog
 if($LASTEXITCODE -ne 0){throw 'Database export failed; private diagnostic log retained. No backup was marked successful.'}
 & (Join-Path $pgBin 'pg_dumpall.exe') '--roles-only' '--no-role-passwords' '--no-password' ('--file='+(Join-Path $work 'roles.sql')) 2>> $nativeLog
 if($LASTEXITCODE -ne 0){throw 'Role definitions could not be exported.'}
 & (Join-Path $pgBin 'pg_restore.exe') '--list' (Join-Path $work 'supabase.dump') 1> (Join-Path $work 'archive-toc.txt') 2>> $nativeLog
 if($LASTEXITCODE -ne 0){throw 'Export archive catalogue verification failed.'}
 $query="select json_build_object('captured_at',now(),'server_version',current_setting('server_version'),'users',(select count(*) from auth.users),'identities',(select count(*) from auth.identities),'favorites',(select count(*) from public.sianaly_favorites),'pending_departures',(select count(*) from public.sianaly_member_departures),'storage_objects',(select count(*) from storage.objects),'mfa_factors',(select count(*) from auth.mfa_factors),'scope','auth,public,sianaly_internal','warning','Counts are captured after the dump. Provider/SMTP/API/encryption-root settings and storage objects are separate; restore validation is still required.')::text;"
 & $psql '-X' '-A' '-t' '--no-password' '-v' 'ON_ERROR_STOP=1' '-c' $query 1> (Join-Path $work 'supabase-manifest.json') 2>> $nativeLog
 if($LASTEXITCODE -ne 0){throw 'Backup manifest capture failed.'}
 # Password travels in stdin, not command-line arguments or a plaintext settings file.
 @{password=$settings.BackupPassword} | ConvertTo-Json -Compress | & node (Join-Path $ProjectRoot 'scripts/backup-vault.mjs') pack $work $archive
 if($LASTEXITCODE -ne 0){throw 'Backup encryption or integrity verification failed.'}
 # Delete only this run's own staging directory after encryption round-trip succeeds.
 $resolvedWork=[IO.Path]::GetFullPath($work)
 $expectedParent=[IO.Path]::GetFullPath($privateRoot)+[IO.Path]::DirectorySeparatorChar
 if(!$resolvedWork.StartsWith($expectedParent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedWork -Leaf) -notmatch '^capture-\d{8}T\d{9}Z$'){throw 'Staging cleanup path check failed.'}
 Remove-Item -LiteralPath $resolvedWork -Recurse -Force
 & (Join-Path $PSScriptRoot 'expire-local-backups.ps1') -ProjectRoot $ProjectRoot -Apply
 [pscustomobject]@{EncryptedArchive=$archive;ArchiveReadable=$true;Restored=$false;UploadedToDrive=$false}
}finally{
 foreach($name in $oldEnvironment.Keys){[Environment]::SetEnvironmentVariable($name,$oldEnvironment[$name],'Process')}
 $settings=$null
}
