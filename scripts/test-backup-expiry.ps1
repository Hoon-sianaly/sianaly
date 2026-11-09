$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$testRoot=[IO.Path]::GetFullPath((Join-Path $projectRoot ('tmp/backup-expiry-'+[guid]::NewGuid().ToString('N'))))
$expectedRoot=[IO.Path]::GetFullPath((Join-Path $projectRoot 'tmp'))+[IO.Path]::DirectorySeparatorChar
if(!$testRoot.StartsWith($expectedRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Test path check failed.'}
$dir=Join-Path $testRoot 'backups'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
try{
 $old=[DateTime]::UtcNow.AddDays(-31).ToString("yyyyMMdd'T'HHmmssfff'Z'")
 $new=[DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'")
 foreach($kind in @('supabase','d1')){
  [IO.File]::WriteAllText((Join-Path $dir "sianaly-$kind-$old.sianaly-backup"),'synthetic expired fixture')
  [IO.File]::WriteAllText((Join-Path $dir "sianaly-$kind-$new.sianaly-backup"),'synthetic current fixture')
 }
 [IO.File]::WriteAllText((Join-Path $dir 'unrelated.sianaly-backup'),'preserve')
 $preview=@(& (Join-Path $PSScriptRoot 'expire-local-backups.ps1') -ProjectRoot $testRoot)
 if($preview[-1].ExpiredArchives -ne 2 -or @(Get-ChildItem -LiteralPath $dir -File).Count -ne 5){throw 'Expiry preview changed files or missed old fixtures.'}
 $applied=@(& (Join-Path $PSScriptRoot 'expire-local-backups.ps1') -ProjectRoot $testRoot -Apply)
 if($applied[-1].ExpiredArchives -ne 2 -or @(Get-ChildItem -LiteralPath $dir -File).Count -ne 3){throw 'Expiry did not preserve current/unrelated files.'}
 Write-Output 'Backup expiry passed: preview is read-only; only matching archives older than 30 days deleted; current/unrelated files preserved.'
}finally{
 if([IO.Path]::GetFullPath($testRoot).StartsWith($expectedRoot,[StringComparison]::OrdinalIgnoreCase)){
  Remove-Item -LiteralPath $testRoot -Recurse -Force
 }
}
