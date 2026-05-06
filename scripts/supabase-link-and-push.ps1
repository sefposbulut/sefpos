# Yeni Supabase projesine tum migration'lari uygular.
# Onceden: https://supabase.com/dashboard/account/tokens → Access Token olusturun.
# Proje: Settings → Database → Database password

$ErrorActionPreference = "Stop"
$ref = "vjxnumivcucbjmhrytxp"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "SUPABASE_ACCESS_TOKEN tanimli degil. Ornek:" -ForegroundColor Yellow
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."' -ForegroundColor Gray
  exit 1
}
if (-not $env:SUPABASE_DB_PASSWORD) {
  Write-Host "SUPABASE_DB_PASSWORD tanimli degil (Database settings sifresi)." -ForegroundColor Yellow
  exit 1
}

Set-Location (Join-Path $PSScriptRoot "..")
npx supabase link --project-ref $ref
npx supabase db push --linked --password $env:SUPABASE_DB_PASSWORD
Write-Host "Bitti. Edge functions ayri: npx supabase functions deploy ..." -ForegroundColor Green
