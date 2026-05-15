/**
 * Integration tests via @modelcontextprotocol/sdk's InMemoryTransport.
 *
 * Each test wires a Client + Server pair through a linked transport,
 * mocks the global fetch (so no real HTTP hits the API), and exercises
 * a tool end-to-end through the MCP protocol. This is the SDK-blessed
 * way to test a server without spawning a child process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/index';

const TEST_CONFIG = {
  baseUrl: 'https://api.example.test',
  token: 'mcp_live_test_token_synthetic_value_for_tests_only',
  readOnly: false,
} as const;

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

interface PreparedCall {
  matcher: (url: string, init?: FetchInit) => boolean;
  response: Response;
}

let originalFetch: typeof fetch;
let prepared: PreparedCall[];

beforeEach(() => {
  originalFetch = globalThis.fetch;
  prepared = [];
  globalThis.fetch = vi.fn(async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const p of prepared) {
      if (p.matcher(url, init)) return p.response;
    }
    throw new Error(`No mock prepared for ${init?.method ?? 'GET'} ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockApi(path: string, response: Response): void {
  prepared.push({
    matcher: (url) => url.endsWith(path),
    response,
  });
}

async function connectedClient(readOnly = false): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer({ ...TEST_CONFIG, readOnly });
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe('tool registration', () => {
  it('exposes 6 tools when read-write', async () => {
    const client = await connectedClient(false);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'bootstrap_leaderboard',
        'get_board_top_n',
        'get_keys',
        'get_sdk_snippet',
        'list_boards',
        'list_games',
      ].sort(),
    );
  });

  it('omits bootstrap_leaderboard when read-only', async () => {
    const client = await connectedClient(true);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).not.toContain('bootstrap_leaderboard');
    expect(names).toContain('list_games');
  });

  it('bootstrap_leaderboard description hints "use when starting from scratch"', async () => {
    // The first sentence is load-bearing for AI tool selection — pin it.
    const client = await connectedClient(false);
    const tools = await client.listTools();
    const bootstrap = tools.tools.find((t) => t.name === 'bootstrap_leaderboard');
    expect(bootstrap?.description?.toLowerCase()).toContain('starting from scratch');
  });
});

// ---------------------------------------------------------------------------
// Happy-path tool execution
// ---------------------------------------------------------------------------

describe('list_games', () => {
  it('passes through the API response', async () => {
    mockApi(
      '/v1/mcp/games',
      jsonResponse({ ok: true, games: [{ id: 'g1', slug: 'pong', name: 'Pong', createdAt: 1 }] }),
    );
    const client = await connectedClient();
    const result = await client.callTool({ name: 'list_games', arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('pong');
  });
});

describe('bootstrap_leaderboard', () => {
  it('calls POST /v1/mcp/bootstrap and returns the snippet', async () => {
    const fakeSnippet = "import { Scorezilla } from 'scorezilla';";
    mockApi(
      '/v1/mcp/bootstrap',
      jsonResponse({
        ok: true,
        gameId: '11111111-1111-1111-1111-111111111111',
        boardId: '22222222-2222-2222-2222-222222222222',
        publicKey: 'pk_pong_AbCdEf',
        sdkSnippet: fakeSnippet,
      }),
    );
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'bootstrap_leaderboard',
      arguments: {
        gameName: 'Pong',
        gameSlug: 'pong',
        boardName: 'High Scores',
        boardSlug: 'high-scores',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('pk_pong_AbCdEf');
    expect(text).toContain(fakeSnippet);
  });
});

// ---------------------------------------------------------------------------
// Error pass-through
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('passes through 401 auth_required + resource_uri hint', async () => {
    mockApi(
      '/v1/mcp/games',
      jsonResponse(
        {
          ok: false,
          error: 'auth_required',
          message: 'Run `scorezilla-mcp login`',
          resource_uri: 'scorezilla://docs/quickstart',
        },
        401,
      ),
    );
    const client = await connectedClient();
    const result = await client.callTool({ name: 'list_games', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('auth_required');
    expect(text).toContain('scorezilla://docs/quickstart');
  });

  it('surfaces network errors as tool errors (not protocol errors)', async () => {
    // No mock prepared → the harness throws. The api-client catches the
    // throw and returns a network_error result the tool turns into a
    // friendly isError:true response.
    const client = await connectedClient();
    const result = await client.callTool({ name: 'list_games', arguments: {} });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('input validation', () => {
  it('rejects bootstrap_leaderboard with invalid slug as a tool-level error (LLM-recoverable)', async () => {
    // The MCP SDK surfaces input-schema failures as `{ isError: true,
    // content: [...] }` rather than protocol-throws — same shape as our
    // API-error pass-through. The LLM can read the validation message
    // and retry with a corrected argument instead of cascading the
    // failure up the host process.
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'bootstrap_leaderboard',
      arguments: {
        gameName: 'X',
        gameSlug: 'BAD_SLUG_WITH_UNDERSCORES',
        boardName: 'Y',
        boardSlug: 'ok-slug',
      },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('gameSlug');
  });
});
