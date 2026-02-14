param(
  [string]$ProjectId = "veluga-ops-tool",
  [string]$Region = "asia-northeast3",
  [string]$Repository = "veluga-backend",
  [string]$Service = "log-csv-api",
  [string]$Image = "log-csv-api"
)

$ErrorActionPreference = "Stop"

$Tag = (Get-Date -Format "yyyyMMdd-HHmmss")
$ImageUri = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Image`:$Tag"

Write-Host "Using image: $ImageUri"

Push-Location "$PSScriptRoot\..\backend"
try {
  docker build -t $ImageUri .
  docker push $ImageUri
}
finally {
  Pop-Location
}

gcloud run deploy $Service `
  --project $ProjectId `
  --image $ImageUri `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --min-instances 0 `
  --max-instances 3 `
  --concurrency 30 `
  --timeout 300 `
  --memory 512Mi

Write-Host "Deployment finished for service '$Service'."