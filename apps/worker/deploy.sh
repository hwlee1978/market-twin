#!/usr/bin/env bash
#
# One-shot build + deploy of the market-twin worker to Cloud Run.
# Run from the project root:
#   bash apps/worker/deploy.sh
#
# Pre-reqs:
#   1. gcloud CLI installed + authenticated (`gcloud auth login`).
#   2. apps/worker/cloud-run.env.yaml exists (copy from .example.yaml).
#   3. Artifact Registry repo "market-twin" exists in asia-northeast3
#      (created in Phase 0).
#
# Idempotent: each run builds a fresh image with a SHORT_SHA tag + the
# floating "latest" tag, then redeploys the Cloud Run service. Old
# revisions stay around for instant rollback via the Cloud Run console.

set -euo pipefail

# ─── Config (override via env if needed) ──────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-market-twin-prod-495905}"
REGION="${GCP_REGION:-asia-northeast3}"
REPO_NAME="${GCP_AR_REPO:-market-twin}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-market-twin-worker}"
SERVICE_ACCOUNT="${CLOUD_RUN_SA:-market-twin-deployer@${PROJECT_ID}.iam.gserviceaccount.com}"

IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/worker"
ENV_FILE="${BASH_SOURCE[0]%/*}/cloud-run.env.yaml"

# ─── Pre-flight checks ────────────────────────────────────────────────
if ! command -v gcloud >/dev/null 2>&1; then
  echo "✗ gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ env file missing: $ENV_FILE" >&2
  echo "  Copy from $ENV_FILE.example and fill in values." >&2
  exit 1
fi

# Ensure correct project + region active so any stray gcloud command in
# the script doesn't operate on a different project by accident.
gcloud config set project "$PROJECT_ID" --quiet >/dev/null
gcloud config set run/region "$REGION" --quiet >/dev/null

# Sanity check the bearer token is non-empty — empty token = anyone can
# trigger a job, want to fail at deploy time, not when Vercel calls us.
if ! grep -q '^WORKER_BEARER_TOKEN: ".\+"' "$ENV_FILE"; then
  echo "✗ WORKER_BEARER_TOKEN appears empty in $ENV_FILE" >&2
  echo "  Generate one with:  openssl rand -hex 32" >&2
  exit 1
fi

# Image tag = short git sha when in a git tree, else timestamp. Lets us
# trace any Cloud Run revision back to a specific commit.
if git rev-parse --short HEAD >/dev/null 2>&1; then
  TAG="$(git rev-parse --short HEAD)"
else
  TAG="$(date +%Y%m%d-%H%M%S)"
fi
IMAGE="${IMAGE_BASE}:${TAG}"
LATEST_IMAGE="${IMAGE_BASE}:latest"

echo
echo "┌── deploy plan ──────────────────────────────────────────"
echo "│ project    : $PROJECT_ID"
echo "│ region     : $REGION"
echo "│ service    : $SERVICE_NAME"
echo "│ image      : $IMAGE"
echo "│ env file   : $ENV_FILE"
echo "│ git tag    : $TAG"
echo "└─────────────────────────────────────────────────────────"
echo

# ─── 1. Build + push image via Cloud Build ────────────────────────────
echo "→ submitting build to Cloud Build (no local docker required)..."
gcloud builds submit \
  --project="$PROJECT_ID" \
  --tag="$IMAGE" \
  --timeout=900s \
  .

# Tag the same digest as :latest so the next deploy can roll back to a
# named tag if needed. Cloud Build only supports one --tag, so we
# add the second tag separately.
echo "→ tagging :latest"
gcloud artifacts docker tags add "$IMAGE" "$LATEST_IMAGE" \
  --project="$PROJECT_ID" \
  --quiet

# ─── 2. Deploy to Cloud Run ───────────────────────────────────────────
echo "→ deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SERVICE_ACCOUNT" \
  --memory=2Gi \
  --cpu=1 \
  --concurrency=20 \
  --min-instances=0 \
  --max-instances=5 \
  --timeout=3600s \
  --no-cpu-throttling \
  --port=8080 \
  --env-vars-file="$ENV_FILE" \
  --quiet

# ─── 3. Print URL + smoke check ───────────────────────────────────────
URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

echo
echo "✅ deployed."
echo "   URL: $URL"
echo
echo "smoke test (no auth, public health):"
echo "   curl -s $URL/health"
echo
echo "next: set Vercel env var WORKER_BASE_URL=$URL"
echo "      and WORKER_BEARER_TOKEN=<same value as in $ENV_FILE>"
