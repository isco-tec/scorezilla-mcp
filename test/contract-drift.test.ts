/**
 * Cross-repo contract drift guard (scorezilla#407, ADR 0010 upstream).
 *
 * `src/contract.ts` hand-mirrors the API's MCP wire contract. This guard makes
 * that mirror provable instead of hoped-for: the canonical contract is vendored
 * from the private monorepo into `test/contract/mcp.generated.ts` by the
 * contract sync (generated, hash-stamped — never hand-edited), and this test
 * asserts, in three layers:
 *   1. the vendored copy matches its synced source hash (no hand edits),
 *   2. the EXPORT NAME sets match (an upstream addition fails here until
 *      mirrored — the `isMcp*` runtime guards are intentionally upstream-only),
 *   3. every shared type is STRUCTURALLY IDENTICAL (expectTypeOf) and every
 *      shared const array is value-identical.
 *
 * When this fails after a sync auto-PR: update `src/contract.ts` to match the
 * vendored copy (that's the point), never the other way around.
 *
 * Enforcement split (both run in CI): layers 1/2/4 fail `npm test` (vitest);
 * layer 3's expectTypeOf assertions are COMPILE-time and fail
 * `npm run typecheck` (vitest's transform strips types without checking them).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as Local from '../src/contract.js';
import * as Vendored from './contract/mcp.generated.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDORED_PATH = join(HERE, 'contract/mcp.generated.ts');
const LOCAL_PATH = join(HERE, '../src/contract.ts');

// Upstream-only exports the scaffold deliberately does not mirror: the API
// needs these runtime guards at its request boundary; the scaffold does not.
const VENDORED_ONLY = new Set([
  'isMcpAuthProvider',
  'isMcpHostingPattern',
  'isMcpPlayerIdentityStrategy',
  'isMcpServerLanguage',
  'isMcpVerifiableAuthProvider',
]);

function exportNames(file: string): Set<string> {
  const src = readFileSync(file, 'utf8');
  return new Set(
    [...src.matchAll(/^export (?:interface|type|const|function) ([A-Za-z_$][\w$]*)/gm)].map(
      (m) => m[1]!,
    ),
  );
}

describe('MCP contract mirrors the monorepo source of truth (#407)', () => {
  it('the vendored copy was not hand-edited (matches its synced source hash)', () => {
    const file = readFileSync(VENDORED_PATH, 'utf8');
    const declared = file.match(/source-sha256: ([a-f0-9]{64})/)?.[1];
    const body = file.replace(/^[\s\S]*?source-sha256: [a-f0-9]{64}\n\n/, '');
    expect(
      createHash('sha256').update(body).digest('hex'),
      'test/contract/mcp.generated.ts was edited by hand — re-run the monorepo contract sync instead',
    ).toBe(declared);
  });

  it('export name sets match (upstream additions/removals fail until mirrored)', () => {
    const vendored = exportNames(VENDORED_PATH);
    const local = exportNames(LOCAL_PATH);
    const missingLocally = [...vendored].filter((n) => !local.has(n) && !VENDORED_ONLY.has(n));
    const extraLocally = [...local].filter((n) => !vendored.has(n));
    expect(
      missingLocally,
      `New upstream contract export(s) not mirrored in src/contract.ts: ${missingLocally.join(', ')}`,
    ).toEqual([]);
    expect(
      extraLocally,
      `src/contract.ts exports absent upstream (stale/renamed?): ${extraLocally.join(', ')}`,
    ).toEqual([]);
  });

  it('every shared type is structurally identical to the source of truth', () => {
    // Response envelopes
    expectTypeOf<Local.McpOk>().toEqualTypeOf<Vendored.McpOk>();
    expectTypeOf<Local.McpError>().toEqualTypeOf<Vendored.McpError>();
    // Games / boards / keys
    expectTypeOf<Local.McpGameSummary>().toEqualTypeOf<Vendored.McpGameSummary>();
    expectTypeOf<Local.McpListGamesResponse>().toEqualTypeOf<Vendored.McpListGamesResponse>();
    expectTypeOf<Local.McpBoardSummary>().toEqualTypeOf<Vendored.McpBoardSummary>();
    expectTypeOf<Local.McpListBoardsResponse>().toEqualTypeOf<Vendored.McpListBoardsResponse>();
    expectTypeOf<Local.McpCreateGameResponse>().toEqualTypeOf<Vendored.McpCreateGameResponse>();
    expectTypeOf<Local.McpCreateBoardResponse>().toEqualTypeOf<Vendored.McpCreateBoardResponse>();
    expectTypeOf<Local.McpMintKeyResponse>().toEqualTypeOf<Vendored.McpMintKeyResponse>();
    expectTypeOf<Local.McpKeySummary>().toEqualTypeOf<Vendored.McpKeySummary>();
    expectTypeOf<Local.McpGetKeysResponse>().toEqualTypeOf<Vendored.McpGetKeysResponse>();
    // Config updates (#403)
    expectTypeOf<Local.McpUpdateBoardConfigResponse>().toEqualTypeOf<Vendored.McpUpdateBoardConfigResponse>();
    expectTypeOf<Local.McpUpdateGameConfigResponse>().toEqualTypeOf<Vendored.McpUpdateGameConfigResponse>();
    // Axes
    expectTypeOf<Local.McpPlayerIdentityStrategy>().toEqualTypeOf<Vendored.McpPlayerIdentityStrategy>();
    expectTypeOf<Local.McpAuthProvider>().toEqualTypeOf<Vendored.McpAuthProvider>();
    expectTypeOf<Local.McpVerifiableAuthProvider>().toEqualTypeOf<Vendored.McpVerifiableAuthProvider>();
    expectTypeOf<Local.McpHostingPattern>().toEqualTypeOf<Vendored.McpHostingPattern>();
    expectTypeOf<Local.McpServerLanguage>().toEqualTypeOf<Vendored.McpServerLanguage>();
    // Bootstrap
    expectTypeOf<Local.McpSnippetBundle>().toEqualTypeOf<Vendored.McpSnippetBundle>();
    expectTypeOf<Local.McpBootstrapSuccess>().toEqualTypeOf<Vendored.McpBootstrapSuccess>();
    expectTypeOf<Local.McpBootstrapErrorCode>().toEqualTypeOf<Vendored.McpBootstrapErrorCode>();
    expectTypeOf<Local.McpBootstrapError>().toEqualTypeOf<Vendored.McpBootstrapError>();
    expectTypeOf<Local.McpBootstrapPartialFailure>().toEqualTypeOf<Vendored.McpBootstrapPartialFailure>();
    expectTypeOf<Local.McpBootstrapResponse>().toEqualTypeOf<Vendored.McpBootstrapResponse>();
    // Leaderboard / snippets
    expectTypeOf<Local.McpLeaderboardEntry>().toEqualTypeOf<Vendored.McpLeaderboardEntry>();
    expectTypeOf<Local.McpGetBoardTopResponse>().toEqualTypeOf<Vendored.McpGetBoardTopResponse>();
    expectTypeOf<Local.McpSdkSnippetResponse>().toEqualTypeOf<Vendored.McpSdkSnippetResponse>();
  });

  it('every shared const array is value-identical (they feed z.enum at runtime)', () => {
    expect(Local.MCP_IDENTITY_STRATEGIES).toEqual(Vendored.MCP_IDENTITY_STRATEGIES);
    expect(Local.MCP_AUTH_PROVIDERS).toEqual(Vendored.MCP_AUTH_PROVIDERS);
    expect(Local.MCP_VERIFIABLE_AUTH_PROVIDERS).toEqual(Vendored.MCP_VERIFIABLE_AUTH_PROVIDERS);
    expect(Local.MCP_HOSTING_PATTERNS).toEqual(Vendored.MCP_HOSTING_PATTERNS);
    expect(Local.MCP_SERVER_LANGUAGES).toEqual(Vendored.MCP_SERVER_LANGUAGES);
  });
});
