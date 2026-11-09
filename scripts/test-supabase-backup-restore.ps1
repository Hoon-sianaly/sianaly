param([string]$Archive,[string]$ProjectRoot=(Split-Path $PSScriptRoot -Parent),[switch]$RunIntegrated,[switch]$RunPrivacyReplay)
$ErrorActionPreference='Stop'
$ProjectRoot=[IO.Path]::GetFullPath($ProjectRoot)
$privateRoot=Join-Path $ProjectRoot '.secrets/backup'
$configCredential=[pscredential]::new('backup',((Get-Content -LiteralPath (Join-Path $privateRoot 'settings.dpapi') -Raw).Trim() | ConvertTo-SecureString))
$settings=$configCredential.GetNetworkCredential().Password | ConvertFrom-Json
$configCredential=$null
if(!$Archive){$Archive=(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'backups') -Filter 'sianaly-supabase-*.sianaly-backup' | Sort-Object Name -Descending | Select-Object -First 1).FullName}
if(!$Archive){throw 'No archive to test.'}
$pgBin=Join-Path $ProjectRoot 'tmp/backup-tools/postgresql17/pgsql/bin'
$work=Join-Path $privateRoot ('restore-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
$data=Join-Path $work 'pgdata';$unpacked=Join-Path $work 'unpacked'
New-Item -ItemType Directory -Path $work | Out-Null
$log=Join-Path $work 'private-restore.log'
$oldPassword=$env:PGPASSWORD;$started=$false
try{
 @{password=$settings.BackupPassword} | ConvertTo-Json -Compress | & node (Join-Path $ProjectRoot 'scripts/backup-vault.mjs') unpack $Archive $unpacked
 if($LASTEXITCODE -ne 0){throw 'Archive decryption failed.'}
 $localPassword=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 $pwfile=Join-Path $work 'local-postgres-password.txt'
 [IO.File]::WriteAllText($pwfile,$localPassword)
 & (Join-Path $pgBin 'initdb.exe') '-D' $data '-U' 'restore_admin' '-A' 'scram-sha-256' ('--pwfile='+$pwfile) '--encoding=UTF8' '--no-locale' 1> $log 2>&1
 if($LASTEXITCODE -ne 0){throw 'Private local PostgreSQL initialization failed.'}
 Remove-Item -LiteralPath $pwfile -Force
 $serverLog=Join-Path $work 'server.log'
 $startArgs=@('-D',('"'+$data+'"'),'-o','"-h 127.0.0.1 -p 55439"','-l',('"'+$serverLog+'"'),'-w','-t','30','start')
 # Do not attach the background server to a PowerShell native-command output pipe.
 $starter=Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $work 'pgctl-start.log') -RedirectStandardError (Join-Path $work 'pgctl-start-error.log') -PassThru
 $starter.WaitForExit()
 if($starter.ExitCode -ne 0){throw 'Private loopback-only PostgreSQL could not start (port may be occupied).'}
 $started=$true;$env:PGPASSWORD=$localPassword
 $connection=@('-h','127.0.0.1','-p','55439','-U','restore_admin','-d','postgres','--no-password')
 # Hosted role grantors have managed privileges absent on standalone Postgres.
 # For the disposable local test only, keep memberships but let restore_admin grant them.
 $localRoles=Join-Path $work 'local-test-roles.sql'
 (Get-Content -LiteralPath (Join-Path $unpacked 'roles.sql') -Raw) -replace ' GRANTED BY supabase_admin(?=;)', '' | Set-Content -LiteralPath $localRoles -Encoding utf8
 & (Join-Path $pgBin 'psql.exe') @connection '-X' '-v' 'ON_ERROR_STOP=1' '-f' $localRoles 1>> $log 2>&1
 if($LASTEXITCODE -ne 0){throw 'Local role restore failed.'}
 # initdb creates an empty public schema; let the archive restore its original owner/ACL.
 & (Join-Path $pgBin 'psql.exe') @connection '-X' '-v' 'ON_ERROR_STOP=1' '-c' 'drop schema public;' 1>> $log 2>&1
 if($LASTEXITCODE -ne 0){throw 'Empty local public schema preparation failed.'}
 & (Join-Path $pgBin 'pg_restore.exe') @connection '--exit-on-error' '--single-transaction' (Join-Path $unpacked 'supabase.dump') 1>> $log 2>&1
 if($LASTEXITCODE -ne 0){throw 'Local database restore failed; no live database was modified.'}
 $sql=@'
select json_build_object('users',(select count(*) from auth.users),'identities',(select count(*) from auth.identities),'favorites',(select count(*) from public.sianaly_favorites),'pending_departures',(select count(*) from public.sianaly_member_departures),'favorites_rls',(select relrowsecurity and relforcerowsecurity from pg_class where oid='public.sianaly_favorites'::regclass),'departure_rls',(select relrowsecurity and relforcerowsecurity from pg_class where oid='public.sianaly_member_departures'::regclass),'favorite_policies',(select count(*) from pg_policies where schemaname='public' and tablename='sianaly_favorites'),'departure_trigger',(select count(*) from pg_trigger where tgname='sianaly_queue_member_departure' and not tgisinternal))::text;
'@
 $summary=& (Join-Path $pgBin 'psql.exe') @connection '-X' '-A' '-t' '-v' 'ON_ERROR_STOP=1' '-c' $sql 2>> $log
 if($LASTEXITCODE -ne 0){throw 'Restored database count and policy check failed.'}
 $restored=$summary | ConvertFrom-Json
 $source=Get-Content -LiteralPath (Join-Path $unpacked 'supabase-manifest.json') -Raw | ConvertFrom-Json
 foreach($name in @('users','identities','favorites','pending_departures')){if($restored.$name -ne $source.$name){throw 'Source/restored counts differ; review concurrent writes before calling the test successful.'}}
 if(!$restored.favorites_rls -or !$restored.departure_rls -or $restored.favorite_policies -ne 3 -or $restored.departure_trigger -ne 1){throw 'Restored security definitions do not match requirements.'}
 # Confirm restored grants deny anonymous reads; do not print actual rows.
 $denied=& (Join-Path $pgBin 'psql.exe') @connection '-X' '-v' 'ON_ERROR_STOP=1' '-c' 'set role anon; select count(*) from public.sianaly_favorites;' 2>> $log
 if($LASTEXITCODE -eq 0){throw 'Anonymous favorite access was unexpectedly granted.'}
 $behaviorSql=@'
begin;
insert into auth.users(id) values ('f0000000-0000-4000-8000-000000000001'),('f0000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
insert into public.sianaly_favorites(user_id,company_key) values ('f0000000-0000-4000-8000-000000000001','samsung');
do $$ begin
 if (select count(*) from public.sianaly_favorites) <> 1 then raise exception 'Owner isolation failed'; end if;
 begin
  insert into public.sianaly_favorites(user_id,company_key) values ('f0000000-0000-4000-8000-000000000002','naver');
  raise exception 'Cross-owner insert unexpectedly permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
delete from auth.users where id='f0000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.sianaly_favorites where user_id='f0000000-0000-4000-8000-000000000001') then raise exception 'Favorite deletion cascade failed'; end if;
 if not exists(select 1 from public.sianaly_member_departures where user_id='f0000000-0000-4000-8000-000000000001') then raise exception 'Departure queue trigger failed'; end if;
end $$;
rollback;
'@
 $behaviorPath=Join-Path $work 'restore-behavior-test.sql'
 $behaviorSql | Set-Content -LiteralPath $behaviorPath -Encoding utf8
 & (Join-Path $pgBin 'psql.exe') @connection '-X' '-v' 'ON_ERROR_STOP=1' '-f' $behaviorPath 1>> $log 2>&1
 if($LASTEXITCODE -ne 0){throw 'Restored member isolation or deletion behavior test failed.'}
 if($RunPrivacyReplay){
  $journalArchive=(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'backups') -Filter 'sianaly-d1-*.sianaly-backup' | Sort-Object Name -Descending | Select-Object -First 1).FullName
  if(!$journalArchive){throw 'An independent current recovery-journal backup is required.'}
  $privacyUnpacked=Join-Path $work 'privacy-board-backup'
  @{password=$settings.BackupPassword} | ConvertTo-Json -Compress | & node (Join-Path $ProjectRoot 'scripts/backup-vault.mjs') unpack $journalArchive $privacyUnpacked
  if($LASTEXITCODE -ne 0){throw 'Privacy journal decryption failed.'}
  $privacySqlite=Join-Path $work 'privacy-replay.sqlite'
  & node (Join-Path $ProjectRoot 'scripts/prepare-private-sqlite.mjs') (Join-Path $privacyUnpacked 'community.sql') $privacySqlite
  if($LASTEXITCODE -ne 0){throw 'Private SQLite restore failed.'}
  if([IO.Path]::GetFileName($Archive) -notmatch '^sianaly-supabase-(\d{8}T\d{9}Z)\.sianaly-backup$'){throw 'Backup capture start timestamp missing.'}
  $captureStart=[DateTime]::ParseExact($Matches[1],"yyyyMMdd'T'HHmmssfff'Z'",[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime().ToString('o')
  & (Join-Path $PSScriptRoot 'replay-private-recovery.ps1') -JournalArchive $journalArchive -RestoredSqlite $privacySqlite -BackupStartedAt $captureStart -LocalDatabasePassword (ConvertTo-SecureString $localPassword -AsPlainText -Force)
  $privacyProof=Get-Content -LiteralPath (Join-Path $work 'privacy-replay-result.json') -Raw | ConvertFrom-Json
  if(!$privacyProof.releaseAllowed){throw 'Privacy replay release gate did not pass.'}
  $checkSql="select json_build_object('own_operator_profiles',(select count(*) from auth.users where lower(email)='sianaly11@gmail.com' and raw_app_meta_data->>'sianaly_role'='admin'),'remaining_account_fields',(select count(*) from auth.users where lower(email)='sianaly11@gmail.com' and raw_app_meta_data->>'sianaly_role'='admin' and raw_user_meta_data ?| array['name','full_name','picture','avatar_url']),'remaining_identity_fields',(select count(*) from auth.identities i join auth.users u on u.id=i.user_id where lower(u.email)='sianaly11@gmail.com' and u.raw_app_meta_data->>'sianaly_role'='admin' and i.identity_data ?| array['name','full_name','picture','avatar_url']))::text;"
  $profileCheck=(& (Join-Path $pgBin 'psql.exe') @connection '-X' '-A' '-t' '-v' 'ON_ERROR_STOP=1' '-c' $checkSql) | ConvertFrom-Json
  if($LASTEXITCODE -ne 0 -or $profileCheck.own_operator_profiles -ne 1 -or $profileCheck.remaining_account_fields -ne 0 -or $profileCheck.remaining_identity_fields -ne 0){throw 'Restored own-profile minimization verification failed.'}
  Write-Output 'PASS actual old PostgreSQL backup plus newer encrypted recovery receipt: own unused profile fields remain removed.'
 }
 if($RunIntegrated){
  $boardArchive=(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'backups') -Filter 'sianaly-d1-*.sianaly-backup' | Sort-Object Name -Descending | Select-Object -First 1).FullName
  if(!$boardArchive){throw 'A matching local D1 backup is required.'}
  @{password=$settings.BackupPassword} | ConvertTo-Json -Compress | & node (Join-Path $ProjectRoot 'scripts/backup-vault.mjs') unpack $boardArchive (Join-Path $work 'board-backup')
  if($LASTEXITCODE -ne 0){throw 'D1 backup decryption failed.'}
  & (Join-Path $ProjectRoot 'scripts/run-restored-service-test.ps1') -WorkDirectory $work -ProjectRoot $ProjectRoot
  if($LASTEXITCODE -ne 0){throw 'Combined restored-service test failed.'}
 }
 $remaining=if($RunIntegrated){'External SMTP delivery, Turnstile/OAuth, managed-provider migration and encryption-root configuration are separate release checks.'}else{'Run -RunIntegrated to verify real Auth/PostgREST, combined backup/restore and account departure synchronization. External provider setup is separate.'}
 $result=@{archive=[IO.Path]::GetFileName($Archive);localRestorePassed=$true;ownerIsolationPassed=$true;departureTriggerPassed=$true;integratedServiceTestPassed=[bool]$RunIntegrated;privacyReplayTestPassed=[bool]$RunPrivacyReplay;counts=$restored;testedAt=[DateTime]::UtcNow.ToString('o');liveDatabaseModified=$false;limitations=$remaining}
 $proofDirectory=Join-Path $ProjectRoot 'tmp/backup-verification'
 New-Item -ItemType Directory -Path $proofDirectory -Force | Out-Null
 $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $proofDirectory 'supabase-restore-result.json') -Encoding utf8
 $result | ConvertTo-Json -Depth 5
}finally{
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') '-D' $data '-m' 'fast' '-w' 'stop' 1>> $log 2>&1}
 $env:PGPASSWORD=$oldPassword;$settings=$null;$localPassword=$null
 # Keep the private test database for diagnosis until the validation review is complete.
}
