# VDS API canli klasoru: C:\sefpos-deploy\vds-api  (nssm service buradan calisir)
# Yanlis yere (C:\sefpos-deploy\) kopyalamak eski stub'i birakir.
param(
  [string]$ComputerName = '45.195.231.185',
  [string]$User = 'Administrator',
  [string]$Password = '',
  [string]$LocalElectron = (Join-Path $PSScriptRoot '..\electron')
)

$ErrorActionPreference = 'Stop'
if (-not $Password) { throw 'Password gerekli' }

$sec = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $sec)
$session = New-PSSession -ComputerName $ComputerName -Credential $cred -Authentication Negotiate
try {
  $files = @(
    'vdsApi.cjs',
    'vdsFunctions.cjs',
    'hemenyoldaPush.cjs',
    'vdsPartnerApi.cjs'
  )
  foreach ($f in $files) {
    $src = Join-Path $LocalElectron $f
    if (-not (Test-Path $src)) {
      Write-Host "skip missing $f"
      continue
    }
    Copy-Item -ToSession $session -Path $src -Destination "C:\sefpos-deploy\vds-api\$f" -Force
    Write-Host "copied $f -> vds-api\"
  }
  Invoke-Command -Session $session -ScriptBlock {
    Restart-Service SefposVdsApi -Force
    Start-Sleep -Seconds 3
    (Get-Service SefposVdsApi).Status
    Select-String -Path C:\sefpos-deploy\vds-api\vdsFunctions.cjs -Pattern 'hemenyolda-webhook-push' |
      ForEach-Object { $_.Line.Trim() }
  }
} finally {
  Remove-PSSession $session
}
