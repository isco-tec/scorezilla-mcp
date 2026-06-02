#!/usr/bin/env node
/**
 * Assert that every place a version number lives is in agreement.
 *
 * Three sources of truth converge on the published artifact:
 *
 *   • package.json#version       — the npm tarball version
 *   • server.json#version        — the MCP Registry record version
 *   • server.json.packages[0].version — the Registry's pointer to npm
 *
 * (A fourth — the constant baked into dist/index.js — is now injected
 *  at build time from package.json by tsup, so it can't drift.)
 *
 * The version-bump path goes:
 *
 *   pnpm changeset:version
 *     → changesets/cli bumps package.json
 *     → scripts/sync-server-json-version.mjs propagates to server.json
 *
 * This script asserts the propagation succeeded. Runs in CI on PRs
 * (catches "someone edited server.json directly and forgot the package")
 * and in the release workflow before publish (refuses to ship a
 * Registry record that doesn't match the npm tarball).
 *
 * Exit codes:
 *   0 — all sources agree
 *   1 — drift detected
 */

import { readFileSync } from 'node:fs';

function read(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const pkg = read('../package.json');
const server = read('../server.json');

const checks = [
  { name: 'package.json#version', value: pkg.version },
  { name: 'server.json#version', value: server.version },
  {
    name: 'server.json.packages[0].version',
    value: server.packages?.[0]?.version,
  },
];

// Also assert the package identifier the Registry points at is our
// actual npm name. A wrong identifier here would have the Registry
// resolving consumers to a completely different package — much worse
// than a version drift.
const idChecks = [
  { name: 'package.json#name', value: pkg.name },
  {
    name: 'server.json.packages[0].identifier',
    value: server.packages?.[0]?.identifier,
  },
];

const versions = new Set(checks.map((c) => c.value));
const identifiers = new Set(idChecks.map((c) => c.value));

let failed = false;

if (versions.size > 1) {
  failed = true;
  console.error('✗ Version drift detected:');
  for (const c of checks) console.error(`    ${c.name} = ${c.value}`);
}

if (identifiers.size > 1) {
  failed = true;
  console.error('✗ Package identifier drift detected:');
  for (const c of idChecks) console.error(`    ${c.name} = ${c.value}`);
}

if (failed) {
  console.error('');
  console.error(
    'Run `node scripts/sync-server-json-version.mjs` to align server.json with package.json,',
  );
  console.error('or fix the source-of-truth manually if package.json is wrong.');
  process.exit(1);
}

console.log(`✓ Version sync OK — all sources agree on ${pkg.name}@${pkg.version}`);
