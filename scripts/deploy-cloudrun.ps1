param(
  [string]$ProjectId = "veluga-ops-tool",
  [string]$Region = "asia-northeast3",
  [string]$Repository = "veluga-backend",
  [string]$Service = "log-csv-api",
  [string]$Image = "log-csv-api",
  [string[]]$SetEnvVars = @(),
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

$Tag = (Get-Date -Format "yyyyMMdd-HHmmss")
$ImageUri = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Image`:$Tag"

Write-Host "Using image: $ImageUri"

$PreviousRevision = ""
try {
  $PreviousRevision = (
    gcloud run revisions list `
      --project $ProjectId `
      --region $Region `
      --service $Service `
      --sort-by "~metadata.creationTimestamp" `
      --limit 1 `
      --format "value(metadata.name)"
  ).Trim()
}
catch {
  Write-Host "[info] Unable to detect previous revision before deploy: $($_.Exception.Message)"
}

if ([string]::IsNullOrWhiteSpace($PreviousRevision)) {
  Write-Host "[info] Previous revision not found (first deploy or lookup failed)."
}
else {
  Write-Host "[info] Previous revision: $PreviousRevision"
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

if ($SetEnvVars.Count -gt 0) {
  $envArg = ($SetEnvVars -join ",")
  Write-Host "[deploy] Applying env vars: $envArg"
  $deployArgs += @("--set-env-vars", $envArg)
}

& gcloud @deployArgs

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
}
else {
  Write-Host "[health] Post-deploy checks skipped by flag."
}

Write-Host "Deployment finished for service '$Service'."