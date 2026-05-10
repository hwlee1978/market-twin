# syntax=docker/dockerfile:1.7

# Build context: project root (so we can COPY both packages/shared and
# apps/worker into the same image). Build command from root:
#   docker build -f apps/worker/Dockerfile -t market-twin-worker .
#
# Or for Cloud Run via gcloud:
#   gcloud builds submit --config apps/worker/cloudbuild.yaml .
#
# Why node:20-slim instead of alpine: the @react-pdf/renderer chain (pulled
# in transitively for ensemble PDF assembly when worker takes that over)
# expects glibc; alpine's musl breaks fontconfig. Slim is a few hundred MB
# heavier than alpine but matches the production runtime profile of the
# Vercel serverless target, eliminating "works locally fails in Cloud Run"
# surprises caused by libc differences.

# ─── Stage 1: install dependencies ──────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app/apps/worker

# Copy only package files first so the npm-install layer cache invalidates
# only when deps change, not on every source edit. Big build-time win when
# iterating locally.
COPY apps/worker/package.json apps/worker/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2: runtime image ─────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

# Install minimal CA certs for outbound HTTPS (Supabase, LLM APIs,
# Tavily). The slim image is thin enough that we install + clean in one
# RUN to keep the layer small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules from the deps stage. Doing this BEFORE the
# source copy means a code-only edit doesn't blow away the deps layer.
COPY --from=deps /app/apps/worker/node_modules /app/apps/worker/node_modules

# Make node_modules resolvable from packages/shared too. Files under
# /app/packages/shared/src/... require modules like @supabase/supabase-js,
# and Node walks up the directory tree from the importing file — without
# a node_modules dir at /app, shared imports fail with MODULE_NOT_FOUND
# at container startup.
RUN ln -s /app/apps/worker/node_modules /app/node_modules

# Worker source + the shared workspace it imports from. The tsconfig
# path aliases resolve at runtime via tsx; both directories must be
# present at the relative paths the tsconfig expects.
COPY apps/worker/package.json apps/worker/tsconfig.json /app/apps/worker/
COPY apps/worker/src /app/apps/worker/src
COPY packages/shared /app/packages/shared

# Cloud Run convention: server listens on $PORT. Default 8080 in case
# the env var isn't set (e.g. local docker run without -e PORT).
ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

# Run as a non-root user so a process compromise can't escape the
# container as easily. node:20-slim ships with the unprivileged "node"
# user pre-created.
RUN chown -R node:node /app
USER node

WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/index.ts"]
