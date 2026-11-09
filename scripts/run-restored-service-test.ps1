param([Parameter(Mandatory=$true)][string]$WorkDirectory,[string]$ProjectRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$pgBin=Join-Path $ProjectRoot 'tmp/backup-tools/postgresql17/pgsql/bin'
$authBinary=Join-Path $ProjectRoot 'tmp/restore-stack-tools/auth.exe'
$restBinary=Join-Path $ProjectRoot 'tmp/restore-stack-tools/postgrest/postgrest.exe'
if(!(Test-Path -LiteralPath $authBinary) -or !(Test-Path -LiteralPath $restBinary)){throw 'Real Auth and PostgREST binaries must be prepared first.'}
# A throwaway TLS CA/certificate only for the loopback test, not installed in Windows trust.
$rsa=[Security.Cryptography.RSA]::Create(2048)
$request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=SIANALY isolated restore test',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new();$san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'));$san.AddDnsName('localhost');$request.CertificateExtensions.Add($san.Build())
$certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(2))
$certPath=Join-Path $WorkDirectory 'loopback-test-cert.pem';$keyPath=Join-Path $WorkDirectory 'loopback-test-key.pem'
[IO.File]::WriteAllText($certPath,$certificate.ExportCertificatePem());[IO.File]::WriteAllText($keyPath,$rsa.ExportPkcs8PrivateKeyPem())
$localConfig=@{root=$ProjectRoot;work=$WorkDirectory;pgBin=$pgBin;pgPassword=$env:PGPASSWORD;authBinary=$authBinary;restBinary=$restBinary;certPath=$certPath;keyPath=$keyPath}
$configPath=Join-Path $WorkDirectory 'isolated-test-config.json'
$localConfig | ConvertTo-Json -Compress | Set-Content -LiteralPath $configPath -Encoding utf8
$oldCa=$env:NODE_EXTRA_CA_CERTS
try{
 $env:NODE_EXTRA_CA_CERTS=$certPath
 & node (Join-Path $ProjectRoot 'scripts/test-restored-service.mjs') $configPath
 if($LASTEXITCODE -ne 0){throw 'Real restored-service integration checks did not complete.'}
}finally{$env:NODE_EXTRA_CA_CERTS=$oldCa;$localConfig=$null;$rsa.Dispose();$certificate.Dispose()}
