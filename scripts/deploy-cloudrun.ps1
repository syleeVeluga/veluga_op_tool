param(
  [string]$ProjectId = "veluga-ops-tool",
  [string]$Region = "asia-northeast3",
  [string]$Repository = "veluga-backend",
  [string]$Service = "log-csv-api",
  [string]$Image = "log-csv-api",
  [string[]]$SetEnvVars = @(),
  [ValidateRange(0, 99)]
  [int]$CanaryPercent = 0,
  [switch]$PromoteCanary,
  [switch]$SkipHealthCheck,
  [switch]$DisableAutoRollback,
  [int]$HealthCheckMaxAttempts = 12,
  [int]$HealthCheckIntervalSec = 5
)

$ErrorActionPreference = "Stop"

function Invoke-HealthCheck {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [int]$MaxAttempts = 12,
    [int]$IntervalSec = 5
  )

  $targets = @(
    "/health",
    "/api/health",
    "/api/schema/api_usage_logs"
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $allPassed = $true

    foreach ($path in $targets) {
      $url = "$BaseUrl$path"

      try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10

        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
          $allPassed = $false
          Write-Host "[health] FAIL ($($response.StatusCode)) $url"
        }
        else {
          Write-Host "[health] PASS ($($response.StatusCode)) $url"
        }
      }
      catch {
        $allPassed = $false
        Write-Host "[health] ERROR $url :: $($_.Exception.Message)"
      }
    }

    if ($allPassed) {
      return $true
    }

    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Seconds $IntervalSec
    }
  }

  return $false
}

function Get-PrimaryTrafficRevision {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    [Parameter(Mandatory = $true)]
    [string]$Region,
    [Parameter(Mandatory = $true)]
    [string]$Service
  )

  try {
    $serviceJson = gcloud run services describe $Service `
      --project $ProjectId `
      --region $Region `
      --format json

    if ([string]::IsNullOrWhiteSpace($serviceJson)) {
      return ""
    }

    $service = $serviceJson | ConvertFrom-Json
    $trafficEntries = @($service.status.traffic) | Where-Object {
      $_.revisionName -and $_.percent -gt 0
    }

    if (-not $trafficEntries -or $trafficEntries.Count -eq 0) {
      return ""
    }

    $primary = $trafficEntries | Sort-Object -Property percent -Descending | Select-Object -First 1
    return [string]$primary.revisionName
  }
  catch {
    Write-Host "[info] Unable to resolve traffic revision: $($_.Exception.Message)"
    return ""
  }
}

if ($CanaryPercent -gt 0 -and $CanaryPercent -ge 100) {
  throw "CanaryPercent must be between 1 and 99 when canary rollout is enabled."
}

$Tag = (Get-Date -Format "yyyyMMdd-HHmmss")
$ImageUri = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Image`:$Tag"

Write-Host "Using image: $ImageUri"

$PreviousRevision = Get-PrimaryTrafficRevision -ProjectId $ProjectId -Region $Region -Service $Service

if ([string]::IsNullOrWhiteSpace($PreviousRevision)) {
  Write-Host "[info] Previous traffic revision not found (first deploy or lookup failed)."
}
else {
  Write-Host "[info] Previous stable revision: $PreviousRevision"
}

if ($CanaryPercent -gt 0 -and [string]::IsNullOrWhiteSpace($PreviousRevision)) {
  throw "Canary rollout requires an existing stable revision with traffic."
}

Push-Location "$PSScriptRoot\..\backend"
try {
  docker build -t $ImageUri .
  docker push $ImageUri
}
finally {
  Pop-Location
}

$deployArgs = @(
  "run", "deploy", $Service,
  "--project", $ProjectId,
  "--image", $ImageUri,
  "--region", $Region,
  "--platform", "managed",
  "--allow-unauthenticated",
  "--port", "8080",
  "--min-instances", "0",
  "--max-instances", "3",
  "--concurrency", "30",
  "--timeout", "300",
  "--memory", "512Mi"
)

if ($CanaryPercent -gt 0) {
  $deployArgs += "--no-traffic"
}

if ($SetEnvVars.Count -gt 0) {
  $envArg = ($SetEnvVars -join ",")
  Write-Host "[deploy] Applying env vars: $envArg"
  $deployArgs += @("--set-env-vars", $envArg)
}

& gcloud @deployArgs

$LatestReadyRevision = (
  gcloud run services describe $Service `
    --project $ProjectId `
    --region $Region `
    --format "value(status.latestReadyRevisionName)"
).Trim()

if ([string]::IsNullOrWhiteSpace($LatestReadyRevision)) {
  throw "Failed to resolve latest ready revision after deployment."
}

Write-Host "[deploy] Latest ready revision: $LatestReadyRevision"

if ($CanaryPercent -gt 0) {
  $stablePercent = 100 - $CanaryPercent
  $trafficSpec = "$LatestReadyRevision=$CanaryPercent,$PreviousRevision=$stablePercent"
  Write-Host "[canary] Applying traffic split: $trafficSpec"

  gcloud run services update-traffic $Service `
    --project $ProjectId `
    --region $Region `
    --to-revisions $trafficSpec
}

$ServiceUrl = (
  gcloud run services describe $Service `
    --project $ProjectId `
    --region $Region `
    --format "value(status.url)"
).Trim()

if ([string]::IsNullOrWhiteSpace($ServiceUrl)) {
  throw "Failed to resolve service URL after deployment."
}

Write-Host "[deploy] Service URL: $ServiceUrl"

if (-not $SkipHealthCheck) {
  Write-Host "[health] Starting post-deploy checks..."
  $isHealthy = Invoke-HealthCheck -BaseUrl $ServiceUrl -MaxAttempts $HealthCheckMaxAttempts -IntervalSec $HealthCheckIntervalSec

  if (-not $isHealthy) {
    Write-Host "[health] Deployment verification failed."

    if (-not $DisableAutoRollback -and -not [string]::IsNullOrWhiteSpace($PreviousRevision)) {
      Write-Host "[rollback] Rolling back traffic to revision: $PreviousRevision"
      gcloud run services update-traffic $Service `
        --project $ProjectId `
        --region $Region `
        --to-revisions "$PreviousRevision=100"

      throw "Health check failed and rollback was executed to '$PreviousRevision'."
    }

    if ($DisableAutoRollback) {
      throw "Health check failed. Auto rollback is disabled."
    }

    throw "Health check failed and no previous revision was available for rollback."
  }

  Write-Host "[health] All post-deploy checks passed."

  if ($CanaryPercent -gt 0 -and $PromoteCanary) {
    Write-Host "[canary] Promoting revision '$LatestReadyRevision' to 100% traffic"
    gcloud run services update-traffic $Service `
      --project $ProjectId `
      --region $Region `
      --to-revisions "$LatestReadyRevision=100"

    Write-Host "[canary] Promotion completed."
  }
}
else {
  Write-Host "[health] Post-deploy checks skipped by flag."
}

Write-Host "Deployment finished for service '$Service'."