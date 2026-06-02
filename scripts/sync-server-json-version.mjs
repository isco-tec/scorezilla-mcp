#!/usr/bin/env node
/**
 * Propagate `package.json#version` into `server.json` after a changeset
 * version-bump.
 *
 * Wired into `pnpm changeset:version` as the post-step so a single
 * version bump fan-outs to both surfaces. Idempotent — running it
 * when versions already agree is a no-op.
 *
 * Touches two fields in server.json:
 *   • `.version`
 *   • `.packages[0].version`
 *
 * After this runs, `scripts/check-version-sync.mjs` will pass. CI
 * runs the check regardless to catch the case where someone updated
 * server.json manually without running this script.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const pkgPath = new URL('../package.json', import.meta.url);
const serverPath = new URL('../server.json', import.meta.url);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const server = JSON.parse(readFileSync(serverPath, 'utf8'));

const before = JSON.stringify({
  version: server.version,
  pkgVersion: server.packages?.[0]?.version,
});

server.version = pkg.version;
if (server.packages?.[0]) {
  server.packages[0].version = pkg.version;
}

const after = JSON.stringify({
  version: server.version,
  pkgVersion: server.packages?.[0]?.version,
});

// Preserve trailing newline + 2-space indent (matches mcp-publisher init format)
writeFileSync(serverPath, JSON.stringify(server, null, 2) + '\n');

if (before === after) {
  console.log(
    `✓ server.json already in sync with package.json (${pkg.version}); no changes`,
  );
} else {
  console.log(`✓ server.json synced to ${pkg.name}@${pkg.version}`);
}
