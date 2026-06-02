#!/usr/bin/env bash
# Publish server.json to the MCP Registry via mcp-publisher.
#
# Runs after `publish.sh` (npm tarball is live) so the Registry record
# always points at a real, installable tarball. If npm publish fails,
# we never get here — the Registry stays consistent with what's on npm.
#
# Auth: `mcp-publisher login github-oidc` consumes the standard
# Actions OIDC env vars (`ACTIONS_ID_TOKEN_REQUEST_URL` +
# `ACTIONS_ID_TOKEN_REQUEST_TOKEN`) — present when the job declares
# `permissions: id-token: write`.
#
# The Registry verifies the OIDC claim against the namespace embedded
# in `server.json.name` (`io.github.isco-tec/mcp`). So this workflow
# can only publish on behalf of the `isco-tec` GitHub identity.
#
# Idempotency: republishing the same version is a no-op on the
# Registry side (412 or 409 depending on the API). We surface non-zero
# exit so the workflow notices, but the npm publish has already
# succeeded by then — re-running is safe.

set -euo pipefail

cd "$(dirname "$0")/.."

# Belt-and-suspenders: don't ship a Registry record that disagrees with
# the tarball we just published. The same check ran before npm publish,
# but server.json or package.json could (theoretically) have been
# mutated in between by another step.
node scripts/check-version-sync.mjs

if ! command -v mcp-publisher >/dev/null 2>&1; then
  echo "mcp-publisher not found on PATH; install it before running this script." >&2
  echo "  brew install mcp-publisher" >&2
  echo "  # or download the latest release from:" >&2
  echo "  # https://github.com/modelcontextprotocol/registry/releases" >&2
  exit 1
fi

VERSION=$(node -p "require('./server.json').version")
NAME=$(node -p "require('./server.json').name")

echo "Authenticating with the MCP Registry via GitHub OIDC..."
mcp-publisher login github-oidc

echo "Publishing ${NAME}@${VERSION} to the MCP Registry..."
mcp-publisher publish ./server.json

echo "✓ Registry record updated"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'registry_published=true\n' >> "$GITHUB_OUTPUT"
  printf 'registry_name=%s\n' "$NAME" >> "$GITHUB_OUTPUT"
  printf 'registry_version=%s\n' "$VERSION" >> "$GITHUB_OUTPUT"
fi
