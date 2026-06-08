# check=skip=SecretsUsedInArgOrEnv
# ^ The ENV below is named SCOREZILLA_TOKEN, which the build linter
#   heuristically flags as a secret. Its value is a non-secret, clearly
#   labelled placeholder that only lets the server boot for introspection
#   (see the comment at that line). No real credential is in this image.

# Container image for scorezilla-mcp.
#
# Primary purpose: let automated MCP catalogs (e.g. Glama) boot the server
# and run the stdio introspection handshake (`initialize` + `tools/list`)
# to verify it's a real, working server. It also works as a normal way to
# run the server in a container.
#
# The server is a stdio MCP server: it speaks JSON-RPC over stdin/stdout.
# `tsup` bundles every dependency into a single `dist/index.js`, so the
# runtime stage needs nothing but Node and that one file — no node_modules.
#
# Run for real:
#   docker run --rm -i -e SCOREZILLA_TOKEN=mcp_live_xxx scorezilla-mcp
# (`-i` keeps stdin open for the MCP wire protocol.)

# ---- build stage: install dev deps and bundle ----
FROM node:22-alpine AS build
WORKDIR /app

# Pin pnpm 9 to match CI (.github/workflows/ci.yml). pnpm 10+ blocks
# dependency build scripts by default, which breaks esbuild's
# native-binary postinstall that tsup needs; pnpm 9 runs them.
RUN npm install -g pnpm@9

# Lockfile-first install so the dependency layer caches independently of
# source changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build inputs only — see .dockerignore for what's excluded.
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN pnpm build

# ---- runtime stage: just Node + the bundled binary ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The single bundled, shebanged binary. Dependencies are inlined by tsup.
COPY --from=build /app/dist ./dist

# The server refuses to start without SCOREZILLA_TOKEN (it exits early
# with a "set your token" message). This NON-SECRET placeholder lets the
# server boot far enough to answer the introspection handshake — listing
# tools needs no API call, so the placeholder is never used against the
# API. Override it with a real `mcp_live_*` token to actually call tools:
#   docker run --rm -i -e SCOREZILLA_TOKEN=mcp_live_xxx scorezilla-mcp
ENV SCOREZILLA_TOKEN=placeholder-for-introspection-only

# node:alpine ships an unprivileged `node` user — don't run as root.
USER node

# stdio transport: the MCP host drives the server over stdin/stdout.
ENTRYPOINT ["node", "dist/index.js"]
