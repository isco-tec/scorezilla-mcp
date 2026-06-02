import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

// Read version from package.json at config-eval time. Inlined by tsup
// `define` so the built binary reports the real version without anyone
// having to remember to keep a `VERSION = '0.1.0'` literal in lockstep.
const pkgVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // CLI binary needs a shebang to run via `npx`. tsup preserves it from
  // the source file when set explicitly.
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  splitting: false,
  sourcemap: true,
  // Bundle dependencies into a single output — keeps `npx` startup
  // fast and avoids a node_modules dance on first run.
  noExternal: ['@modelcontextprotocol/sdk', 'zod'],
  // Inline package.json#version at build. Source uses
  // `__SCOREZILLA_MCP_VERSION__` — tsup replaces the identifier verbatim.
  define: {
    __SCOREZILLA_MCP_VERSION__: JSON.stringify(pkgVersion),
  },
});
