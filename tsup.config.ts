import { defineConfig } from 'tsup';

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
  // Bundle dependencies into a single output — keeps `npx` startup
  // fast and avoids a node_modules dance on first run.
  noExternal: ['@modelcontextprotocol/sdk', 'zod'],
});
