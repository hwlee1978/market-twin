# PowerShell port of deploy.sh — same behavior, runs natively on Windows
# without needing Git Bash / WSL.
#
# Run from project root:
#   powershell -ExecutionPolicy Bypass -File apps\worker\deploy.ps1
# or just:
#   .\apps\worker\deploy.ps1

$ErrorActionPreference = "Stop"

# ─── Config (override via env if needed) ──────────────────────────────
$ProjectId      = if ($env:GCP_PROJECT_ID)      { $env:GCP_PROJECT_ID }      else { "market-twin-prod-495905" }
$Region         = if ($env:GCP_REGION)          { $env:GCP_REGION }          else { "asia-northeast3" }
$RepoName       = if ($env:GCP_AR_REPO)         { $env:GCP_AR_REPO }         else { "market-twin" }
$ServiceName    = if ($env:CLOUD_RUN_SERVICE)   { $env:CLOUD_RUN_SERVICE }   else { "market-twin-worker" }
$ServiceAccount = if ($env:CLOUD_RUN_SA)        { $env:CLOUD_RUN_SA }        else { "market-twin-deployer@$ProjectId.iam.gserviceaccount.com" }

$ImageBase = "$Region-docker.pkg.dev/$ProjectId/$RepoName/worker"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile   = Join-Path $ScriptDir "cloud-run.env.yaml"

# ─── Pre-flight checks ────────────────────────────────────────────────
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
    exit 1
}
if (-not (Test-Path $EnvFile)) {
    Write-Error "env file missing: $EnvFile`n  Copy from $EnvFile.example and fill in values."
    exit 1
}

gcloud config set project $ProjectId --quiet | Out-Null
gcloud config set run/region $Region --quiet | Out-Null

# Sanity check the bearer token is non-empty
$envContent = Get-Content $EnvFile -Raw
if ($envContent -notmatch '(?m)^WORKER_BEARER_TOKEN:\s*"[^"]+"') {
    Write-Error "WORKER_BEARER_TOKEN appears empty in $EnvFile`n  Generate one with PowerShell:`n  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })"
    exit 1
}

# Image tag = short git sha when in a git tree, else timestamp
try {
    $Tag = (git rev-parse --short HEAD 2>$null).Trim()
    if (-not $Tag) { throw "not a git repo" }
} catch {
    $Tag = Get-Date -Format "yyyyMMdd-HHmmss"
}
$Image       = "${ImageBase}:${Tag}"
$LatestImage = "${ImageBase}:latest"

Write-Host ""
Write-Host "┌── deploy plan ──────────────────────────────────────────"
Write-Host "│ project    : $ProjectId"
Write-Host "│ region     : $Region"
Write-Host "│ service    : $ServiceName"
Write-Host "│ image      : $Image"
Write-Host "│ env file   : $EnvFile"
Write-Host "│ git tag    : $Tag"
Write-Host "└─────────────────────────────────────────────────────────"
Write-Host ""

# ─── 1. Build + push image via Cloud Build ────────────────────────────
# Use cloudbuild.yaml so we can point at apps/worker/Dockerfile while
# keeping the build context at the project root (Dockerfile COPYs from
# packages/shared which lives outside apps/worker).
Write-Host "→ submitting build to Cloud Build (no local docker required)..."
gcloud builds submit `
    --project=$ProjectId `
    --config=apps/worker/cloudbuild.yaml `
    --substitutions=_IMAGE=$Image `
    --timeout=900s `
    .
if ($LASTEXITCODE -ne 0) { Write-Error "Cloud Build failed"; exit 1 }

Write-Host "→ tagging :latest"
gcloud artifacts docker tags add $Image $LatestImage `
    --project=$ProjectId `
    --quiet
if ($LASTEXITCODE -ne 0) { Write-Error "tag :latest failed"; exit 1 }

# ─── 2. Deploy to Cloud Run ───────────────────────────────────────────
Write-Host "→ deploying to Cloud Run..."
gcloud run deploy $ServiceName `
    --project=$ProjectId `
    --region=$Region `
    --image=$Image `
    --platform=managed `
    --allow-unauthenticated `
    --service-account=$ServiceAccount `
    --memory=2Gi `
    --cpu=1 `
    --concurrency=20 `
    --min-instances=0 `
    --max-instances=5 `
    --timeout=3600s `
    --no-cpu-throttling `
    --port=8080 `
    --env-vars-file=$EnvFile `
    --quiet
if ($LASTEXITCODE -ne 0) { Write-Error "Cloud Run deploy failed"; exit 1 }

# ─── 3. Print URL + smoke check ───────────────────────────────────────
$Url = (gcloud run services describe $ServiceName `
    --project=$ProjectId `
    --region=$Region `
    --format='value(status.url)').Trim()

Write-Host ""
Write-Host "deployed."
Write-Host "   URL: $Url"
Write-Host ""
Write-Host "smoke test (no auth, public health):"
Write-Host "   curl -s $Url/health"
Write-Host ""
Write-Host "next: set Vercel env var WORKER_BASE_URL=$Url"
Write-Host "      and WORKER_BEARER_TOKEN=<same value as in $EnvFile>"
