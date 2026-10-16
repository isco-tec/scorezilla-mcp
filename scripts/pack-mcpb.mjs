#!/usr/bin/env node
/**
 * Build the MCPB bundle (`scorezilla-mcp-<version>.mcpb`) that MCP
 * catalogs like Smithery distribute for local stdio servers, and that
 * Claude Desktop installs in one click.
 *
 * Run after `pnpm build`: stages the single bundled `dist/index.js`
 * (tsup inlines every dependency) plus LICENSE next to
 * `mcpb/manifest.json`, then packs that folder with the official
 * MCPB CLI. Output lands in the repo root (gitignored).
 *
 * `mcpb/manifest.json#version` is kept in sync with package.json by
 * scripts/sync-server-json-version.mjs and checked by release:check.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MCPB_CLI = '@anthropic-ai/mcpb@2.1.2';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const dist = new URL('dist/index.js', root);

if (!existsSync(dist)) {
  console.error('✗ dist/index.js not found — run `pnpm build` first.');
  process.exit(1);
}

mkdirSync(new URL('mcpb/server/', root), { recursive: true });
copyFileSync(dist, new URL('mcpb/server/index.js', root));
copyFileSync(new URL('LICENSE', root), new URL('mcpb/LICENSE', root));

const out = `scorezilla-mcp-${pkg.version}.mcpb`;
const cwd = new URL('.', root).pathname;
execFileSync('npx', ['-y', MCPB_CLI, 'validate', 'mcpb/manifest.json'], { cwd, stdio: 'inherit' });
execFileSync('npx', ['-y', MCPB_CLI, 'pack', 'mcpb', out], { cwd, stdio: 'inherit' });
console.log(`✓ ${out}`);
