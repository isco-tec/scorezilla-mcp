#!/usr/bin/env bash
# Publish @scorezilla/mcp to npm under the correct dist-tag.
#
# Default `npm publish` puts every version on `latest`, including
# pre-releases. We don't want `npm install @scorezilla/mcp` to surprise
# anyone with `0.2.0-next.3`, so this wrapper picks the dist-tag from
# the version string itself:
#
#   • Stable (no dash):              `--tag latest`
#   • Pre-release `-<tag>.<N>`:      `--tag <tag>`  (e.g. 0.2.0-next.0 → next)
#   • Pre-release without `.<N>`:    `--tag <suffix-after-dash>`
#
# Provenance is opt-in via NPM_PUBLISH_WITH_PROVENANCE=1 (set in
# release.yml; this repo is public so the OIDC-signed attestation path
# is available). Outside that env, publishes go through without
# provenance — fine for one-off manual publishes from a developer's
# terminal but never the path CI takes.
#
# Use from CI as `bash scripts/publish.sh`.

set -euo pipefail

cd "$(dirname "$0")/.."

# Pre-flight: the version sync must hold before we ship. The Registry
# record points to a specific npm tarball version; if they drift, an
# agent following the Registry will install the wrong tarball.
node scripts/check-version-sync.mjs

VERSION=$(node -p "require('./package.json').version")

# Match the canonical SemVer pre-release shape `<x.y.z>-<tag>.<N>`.
# BASH_REMATCH[1] captures the alphabetic tag (`next`, `rc`, `alpha`, …).
if [[ "$VERSION" =~ -([a-zA-Z]+)\.[0-9]+ ]]; then
  TAG="${BASH_REMATCH[1]}"
elif [[ "$VERSION" == *-* ]]; then
  # Pre-release without a `.N` suffix (rare; e.g. `0.1.0-beta`).
  TAG="${VERSION#*-}"
else
  TAG=latest
fi

PROVENANCE_FLAG=()
if [[ "${NPM_PUBLISH_WITH_PROVENANCE:-}" == "1" ]]; then
  PROVENANCE_FLAG=(--provenance)
  echo "Provenance: ENABLED (NPM_PUBLISH_WITH_PROVENANCE=1)"
else
  echo "Provenance: DISABLED (set NPM_PUBLISH_WITH_PROVENANCE=1 to enable)"
fi

echo "Publishing @scorezilla/mcp@${VERSION} under npm dist-tag: ${TAG}"

# `npm publish` rather than `pnpm publish` — changesets/action's
# publish-detection parses npm-style stdout. Auth comes from
# ~/.npmrc which setup-node configured from NODE_AUTH_TOKEN.
npm publish --access=public --tag "$TAG" "${PROVENANCE_FLAG[@]}"

# Sentinel signal for downstream workflow steps. Don't rely on
# changesets/action's stdout-parsing of `publishedPackages` — it's
# fragile (the scorezilla-js team hit this in scorezilla-js#20). Owning
# the signal end-to-end means post-publish steps never silently no-op.
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'published=true\n' >> "$GITHUB_OUTPUT"
  printf 'published_name=%s\n' "$(node -p "require('./package.json').name")" >> "$GITHUB_OUTPUT"
  printf 'published_version=%s\n' "$VERSION" >> "$GITHUB_OUTPUT"
fi
