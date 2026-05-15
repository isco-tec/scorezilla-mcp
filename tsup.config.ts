import { defineConfig } from 'tsup';

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
});
