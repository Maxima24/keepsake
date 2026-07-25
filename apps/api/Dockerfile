# Keepsake API — self-contained image (avoids Render buildpack quirks:
# corepack signature, devDep pruning, frozen-lockfile, build-time DB access).
FROM node:22.11.0-bookworm

WORKDIR /app

# pnpm via npm (not corepack — corepack's bundled keys fail signature verification)
RUN npm install -g pnpm@9.15.9

# Workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/sdk/package.json ./packages/sdk/

# Install the API project's deps (incl. dev: prisma, tsx, nest-cli), then rebuild
# native modules — pnpm 9 skips dependency build scripts by default, which would
# leave argon2 without its binary.
RUN pnpm install --no-frozen-lockfile --filter api \
 && pnpm rebuild -r

# API source
COPY apps/api ./apps/api

# Generate the Prisma client + compile Nest -> dist/src/main.js
RUN pnpm --filter api exec prisma generate \
 && pnpm --filter api run build

ENV NODE_ENV=production
WORKDIR /app/apps/api

# Migrations + seed run at container start (DB is reachable at runtime, not build).
# Seed is non-fatal so a hiccup can't block boot. pnpm is available from above.
CMD pnpm exec prisma migrate deploy && (pnpm exec tsx prisma/seed.ts || true) && node dist/src/main
