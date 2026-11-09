param([string]$ProjectRoot=(Split-Path $PSScriptRoot -Parent),[switch]$Apply)
$ErrorActionPreference='Stop'
$archiveRoot=[IO.Path]::GetFullPath((Join-Path $ProjectRoot 'backups'))
if(!(Test-Path -LiteralPath $archiveRoot)){return}
if((Get-Item -LiteralPath $archiveRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup directory must not be a link.'}
$cutoff=[DateTime]::UtcNow.AddDays(-30)
$candidates=@(Get-ChildItem -LiteralPath $archiveRoot -File | Where-Object {
 if($_.Name -notmatch '^sianaly-(supabase|d1)-(\d{8}T\d{9}Z)\.sianaly-backup$'){return $false}
 $captured=[DateTime]::ParseExact($Matches[2],"yyyyMMdd'T'HHmmssfff'Z'",[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
 return $captured -lt $cutoff
})
foreach($file in $candidates){
 if([IO.Path]::GetFullPath($file.DirectoryName) -ne $archiveRoot -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup expiry path validation failed.'}
 if($Apply){Remove-Item -LiteralPath $file.FullName -Force}
 [pscustomobject]@{Archive=$file.Name;Expired=$true;Deleted=[bool]$Apply}
}
[pscustomobject]@{ExpiredArchives=$candidates.Count;Applied=[bool]$Apply;RetentionDays=30}
