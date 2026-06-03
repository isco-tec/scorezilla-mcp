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
  // CLI binary needs a shebang to run via `npx`. Banner is the only
  // source of the shebang — do NOT also add one to src/index.ts, tsup
  // would emit it twice and Node's ESM loader rejects the second.
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  splitting: false,
  sourcemap: true,
  // Minify the bundled output. Cold-start cost via `npx -y` is the
  // dominant UX cost for MCP servers (the host spawns the binary
  // every session), and a ~50% smaller tarball means fewer bytes
  // over the wire and faster parse. Sourcemaps stay full-fidelity
  // for debugging.
  minify: true,
  // Bundle dependencies into a single output — keeps `npx` startup
  // fast and avoids a node_modules dance on first run.
  noExternal: ['@modelcontextprotocol/sdk', 'zod'],
  // Inline package.json#version at build. Source uses
  // `__SCOREZILLA_MCP_VERSION__` — tsup replaces the identifier verbatim.
  define: {
    __SCOREZILLA_MCP_VERSION__: JSON.stringify(pkgVersion),
  },
});
