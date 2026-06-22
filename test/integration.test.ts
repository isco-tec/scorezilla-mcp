/**
 * Integration tests via @modelcontextprotocol/sdk's InMemoryTransport.
 *
 * Each test wires a Client + Server pair through a linked transport,
 * mocks the global fetch (so no real HTTP hits the API), and exercises
 * a tool end-to-end through the MCP protocol. This is the SDK-blessed
 * way to test a server without spawning a child process.
 */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/index';
import type {
  McpBootstrapSuccess,
  McpCreateBoardResponse,
  McpCreateGameResponse,
  McpGameSummary,
  McpGetBoardTopResponse,
  McpKeySummary,
  McpListGamesResponse,
  McpMintKeyResponse,
  McpUpdateBoardConfigResponse,
  McpUpdateGameConfigResponse,
} from '../src/contract';

const TEST_CONFIG = {
  baseUrl: 'https://api.example.test',
  token: 'mcp_live_test_token_synthetic_value_for_tests_only',
  readOnly: false,
  betaToken: null,
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
  it('exposes 11 tools when read-write', async () => {
    const client = await connectedClient(false);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'bootstrap_leaderboard',
        'create_board',
        'create_game',
        'get_board_top_n',
        'get_keys',
        'get_sdk_snippet',
        'list_boards',
        'list_games',
        'mint_key',
        'update_board_config',
        'update_game_config',
      ].sort(),
    );
  });

  it('omits all write tools (bootstrap + create_*/mint_key/update_*) when read-only', async () => {
    const client = await connectedClient(true);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    for (const w of [
      'bootstrap_leaderboard',
      'create_game',
      'create_board',
      'mint_key',
      'update_board_config',
      'update_game_config',
    ]) {
      expect(names).not.toContain(w);
    }
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

describe('write tools', () => {
  it('create_game POSTs to /v1/mcp/games and returns the new game', async () => {
    mockApi(
      '/v1/mcp/games',
      jsonResponse({ ok: true, gameId: 'g-new', slug: 'neon-runner', name: 'Neon Runner' }),
    );
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'create_game',
      arguments: { name: 'Neon Runner', slug: 'neon-runner' },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('g-new');
    expect(text).toContain('neon-runner');
  });

  it('create_board POSTs to the game-scoped path and returns the board', async () => {
    mockApi(
      '/v1/mcp/games/11111111-1111-4111-8111-111111111111/boards',
      jsonResponse({
        ok: true,
        board: {
          id: 'b-new',
          slug: 'world-void',
          name: 'THE VOID',
          sortDir: 'desc',
          scoreKind: 'integer',
          retentionPolicy: 'all',
          minScore: null,
          maxScore: null,
          createdAt: 1,
        },
      }),
    );
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'create_board',
      arguments: { gameId: '11111111-1111-4111-8111-111111111111', name: 'THE VOID', slug: 'world-void' },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('b-new');
    expect(text).toContain('world-void');
  });

  it('mint_key POSTs to the keys path and returns pk_/sk_', async () => {
    mockApi(
      '/v1/mcp/games/11111111-1111-4111-8111-111111111111/keys',
      jsonResponse({
        ok: true,
        publicKey: 'pk_neon_abc',
        secretKey: 'sk_live_xyz',
        secretKeyPrefix: 'sk_live_xyz1',
      }),
    );
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'mint_key',
      arguments: { gameId: '11111111-1111-4111-8111-111111111111' },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('pk_neon_abc');
    expect(text).toContain('sk_live_xyz');
  });

  it('update_board_config PATCHes the board-config path and returns the board', async () => {
    mockApi(
      '/v1/mcp/games/11111111-1111-4111-8111-111111111111/boards/22222222-2222-4222-8222-222222222222/config',
      jsonResponse({
        ok: true,
        board: {
          id: '22222222-2222-4222-8222-222222222222',
          slug: 'high-scores',
          name: 'High Scores',
          sortDir: 'desc',
          scoreKind: 'integer',
          retentionPolicy: 'all',
          retentionN: null,
          minScore: null,
          maxScore: 300,
          createdAt: 1,
        },
      }),
    );
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'update_board_config',
      arguments: {
        gameId: '11111111-1111-4111-8111-111111111111',
        boardId: '22222222-2222-4222-8222-222222222222',
        maxScore: 300,
      },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('300');
  });

  it('update_game_config PATCHes the game-config path and returns the origins', async () => {
    mockApi(
      '/v1/mcp/games/11111111-1111-4111-8111-111111111111/config',
      jsonResponse({
        ok: true,
        gameId: '11111111-1111-4111-8111-111111111111',
        allowedOrigins: ['https://yourgame.com'],
      }),
    );
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'update_game_config',
      arguments: {
        gameId: '11111111-1111-4111-8111-111111111111',
        allowedOrigins: ['https://yourgame.com'],
      },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('yourgame.com');
  });

  // The partial-update contract is the crux of both tools — assert what actually
  // lands on the wire, not just the echoed response.
  const boardConfigBody = {
    ok: true,
    board: {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'high-scores',
      name: 'High Scores',
      sortDir: 'desc',
      scoreKind: 'integer',
      retentionPolicy: 'all',
      retentionN: null,
      minScore: null,
      maxScore: null,
      createdAt: 1,
    },
  };

  /** Wrap fetch to capture the JSON body the tool actually sends. beforeEach resets fetch. */
  function captureBody(): () => Record<string, unknown> | undefined {
    let sent: Record<string, unknown> | undefined;
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, init) => {
      sent = init?.body ? JSON.parse(init.body as string) : undefined;
      return realFetch(input, init);
    }) as typeof fetch;
    return () => sent;
  }

  it('update_board_config sends ONLY the fields the caller provided (partial)', async () => {
    prepared.push({
      matcher: (url) => url.includes('/boards/') && url.endsWith('/config'),
      response: jsonResponse(boardConfigBody),
    });
    const body = captureBody();
    const client = await connectedClient(false);
    await client.callTool({
      name: 'update_board_config',
      arguments: {
        gameId: '11111111-1111-4111-8111-111111111111',
        boardId: '22222222-2222-4222-8222-222222222222',
        maxScore: 300,
      },
    });
    // Omitted fields must NOT appear on the wire — else the API would read them.
    expect(body()).toEqual({ maxScore: 300 });
  });

  it('update_board_config sends an explicit null to clear a bound (not absent)', async () => {
    prepared.push({
      matcher: (url) => url.includes('/boards/') && url.endsWith('/config'),
      response: jsonResponse(boardConfigBody),
    });
    const body = captureBody();
    const client = await connectedClient(false);
    await client.callTool({
      name: 'update_board_config',
      arguments: {
        gameId: '11111111-1111-4111-8111-111111111111',
        boardId: '22222222-2222-4222-8222-222222222222',
        maxScore: null,
      },
    });
    // null must survive to the wire (clear), not be dropped as absent (no change).
    expect(body()).toEqual({ maxScore: null });
  });

  it('update_game_config sends an empty allowedOrigins array as [] (allow all)', async () => {
    prepared.push({
      matcher: (url) => url.endsWith('/config') && !url.includes('/boards/'),
      response: jsonResponse({
        ok: true,
        gameId: '11111111-1111-4111-8111-111111111111',
        allowedOrigins: [],
      }),
    });
    const body = captureBody();
    const client = await connectedClient(false);
    await client.callTool({
      name: 'update_game_config',
      arguments: { gameId: '11111111-1111-4111-8111-111111111111', allowedOrigins: [] },
    });
    expect(body()).toEqual({ allowedOrigins: [] });
  });

  it('update_board_config surfaces a 404 as a tool error', async () => {
    prepared.push({
      matcher: (url) => url.includes('/boards/') && url.endsWith('/config'),
      response: jsonResponse({ ok: false, error: 'not_found', message: 'Board not found' }, 404),
    });
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'update_board_config',
      arguments: {
        gameId: '11111111-1111-4111-8111-111111111111',
        boardId: '22222222-2222-4222-8222-222222222222',
        maxScore: 1,
      },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('not_found');
  });

  it('create_board surfaces a 409 slug conflict as a tool error', async () => {
    mockApi(
      '/v1/mcp/games/11111111-1111-4111-8111-111111111111/boards',
      jsonResponse(
        { ok: false, error: 'slug_taken', message: "A board with slug 'world-void' already exists" },
        409,
      ),
    );
    const client = await connectedClient(false);
    const result = await client.callTool({
      name: 'create_board',
      arguments: { gameId: '11111111-1111-4111-8111-111111111111', name: 'X', slug: 'world-void' },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('slug_taken');
  });

  it('sends a content-derived Idempotency-Key on write tools (retry-safe)', async () => {
    prepared.push({
      matcher: (url) => url.endsWith('/v1/mcp/games'),
      response: jsonResponse({ ok: true, gameId: 'g1', slug: 'neon', name: 'Neon', createdAt: 1 }),
    });
    let observed: Headers | undefined;
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, init) => {
      observed = new Headers(init?.headers);
      return realFetch(input, init);
    }) as typeof fetch;

    const client = await connectedClient(false);
    await client.callTool({ name: 'create_game', arguments: { name: 'Neon', slug: 'neon' } });
    // Derived from the slug → a retry of the same create dedupes server-side.
    expect(observed?.get('idempotency-key')).toBe('create_game:neon');
  });
});

describe('beta token plumbing', () => {
  it('sends X-MCP-Beta header when betaToken is configured', async () => {
    let observedHeaders: Headers | undefined;
    prepared.push({
      matcher: (url) => url.endsWith('/v1/mcp/games'),
      response: jsonResponse({ ok: true, games: [] }),
    });
    // Intercept to capture the actual headers sent.
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, init) => {
      observedHeaders = new Headers(init?.headers);
      return realFetch(input, init);
    }) as typeof fetch;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = buildServer({
      ...TEST_CONFIG,
      betaToken: 'beta-secret-value',
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    await client.callTool({ name: 'list_games', arguments: {} });
    expect(observedHeaders?.get('x-mcp-beta')).toBe('beta-secret-value');
  });

  it('omits X-MCP-Beta header when betaToken is null', async () => {
    let observedHeaders: Headers | undefined;
    prepared.push({
      matcher: (url) => url.endsWith('/v1/mcp/games'),
      response: jsonResponse({ ok: true, games: [] }),
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, init) => {
      observedHeaders = new Headers(init?.headers);
      return realFetch(input, init);
    }) as typeof fetch;

    const client = await connectedClient();
    await client.callTool({ name: 'list_games', arguments: {} });
    expect(observedHeaders?.has('x-mcp-beta')).toBe(false);
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
        snippets: { widget: '<scorezilla-leaderboard board="…">', sdk: fakeSnippet },
        recommendation: 'Use the widget for a drop-in embed, or snippets.sdk to render your own UI.',
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
    // The full bundle + recommendation reach the assistant.
    expect(text).toContain('scorezilla-leaderboard');
    expect(text).toContain('recommendation');
  });

  it('forwards the integration-axis args to the API', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    prepared.push({
      matcher: (url, init) => {
        if (!url.endsWith('/v1/mcp/bootstrap')) return false;
        capturedBody = init?.body ? JSON.parse(init.body as string) : null;
        return true;
      },
      response: jsonResponse({
        ok: true,
        gameId: 'g',
        boardId: 'b',
        publicKey: 'pk_x',
        sdkSnippet: 's',
        snippets: { widget: null, sdk: 's' },
        recommendation: 'r',
      }),
    });
    const client = await connectedClient();
    await client.callTool({
      name: 'bootstrap_leaderboard',
      arguments: {
        gameName: 'Race',
        gameSlug: 'race',
        boardName: 'Times',
        boardSlug: 'times',
        playerIdentityStrategy: 'auth_provider',
        authProvider: 'supabase',
        hostingPattern: 'client_with_server',
        serverLanguage: 'typescript',
      },
    });
    expect(capturedBody).toMatchObject({
      playerIdentityStrategy: 'auth_provider',
      authProvider: 'supabase',
      hostingPattern: 'client_with_server',
      serverLanguage: 'typescript',
    });
  });
});

describe('get_sdk_snippet', () => {
  it('forwards the integration-axis args to POST /v1/mcp/sdk-snippet', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    prepared.push({
      matcher: (url, init) => {
        if (!url.endsWith('/v1/mcp/sdk-snippet')) return false;
        capturedBody = init?.body ? JSON.parse(init.body as string) : null;
        return true;
      },
      response: jsonResponse({ ok: true, snippet: '# python secure-submit handler' }),
    });
    const client = await connectedClient();
    await client.callTool({
      name: 'get_sdk_snippet',
      arguments: {
        gameId: '11111111-1111-4111-8111-111111111111',
        boardId: '22222222-2222-4222-8222-222222222222',
        hostingPattern: 'server_only',
        serverLanguage: 'python',
      },
    });
    expect(capturedBody).toMatchObject({
      gameId: '11111111-1111-4111-8111-111111111111',
      boardId: '22222222-2222-4222-8222-222222222222',
      hostingPattern: 'server_only',
      serverLanguage: 'python',
    });
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

// ---------------------------------------------------------------------------
// Contract — shapes the tests mock against MUST match the types this
// server consumes. If a developer updates `src/contract.ts` (typically
// in lockstep with the API repo's `apps/api/src/mcp/contract.ts`) and
// forgets to update the mocks, this section fails the compile.
// ---------------------------------------------------------------------------

describe('contract shapes', () => {
  it('list_games mock satisfies McpListGamesResponse', () => {
    const fixture = {
      ok: true,
      games: [{ id: 'g1', slug: 'pong', name: 'Pong', createdAt: 1 }],
    } satisfies McpListGamesResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpListGamesResponse>();
    // Runtime assertions catch any future runtime-only drift.
    expect(fixture.ok).toBe(true);
    expect(fixture.games[0]).toMatchObject<McpGameSummary>({
      id: 'g1',
      slug: 'pong',
      name: 'Pong',
      createdAt: 1,
    });
  });

  it('bootstrap_leaderboard mock satisfies McpBootstrapSuccess', () => {
    const fixture = {
      ok: true,
      gameId: '11111111-1111-1111-1111-111111111111',
      boardId: '22222222-2222-2222-2222-222222222222',
      publicKey: 'pk_pong_abc',
      sdkSnippet: "import { Scorezilla } from 'scorezilla';",
      snippets: {
        widget: '<scorezilla-leaderboard board="…">',
        sdk: "import { Scorezilla } from 'scorezilla';",
      },
      recommendation: 'Widget for drop-in; SDK for custom UI.',
    } satisfies McpBootstrapSuccess;
    expectTypeOf(fixture).toMatchTypeOf<McpBootstrapSuccess>();
  });

  it('boards/top mock satisfies McpGetBoardTopResponse', () => {
    const fixture = {
      ok: true,
      boardId: '00000000-0000-0000-0000-000000000000',
      entries: [
        { rank: 1, playerId: 'p1', score: 100, submittedAt: 1 },
      ],
    } satisfies McpGetBoardTopResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpGetBoardTopResponse>();
  });

  it('create_game mock satisfies McpCreateGameResponse', () => {
    const fixture = {
      ok: true,
      gameId: '11111111-1111-4111-8111-111111111111',
      slug: 'pong',
      name: 'Pong',
      createdAt: 1,
    } satisfies McpCreateGameResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpCreateGameResponse>();
    expect(fixture.gameId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('create_board mock satisfies McpCreateBoardResponse', () => {
    const fixture = {
      ok: true,
      board: {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'high-scores',
        name: 'High Scores',
        sortDir: 'desc',
        scoreKind: 'integer',
        retentionPolicy: 'top_n',
        retentionN: 100,
        minScore: null,
        maxScore: null,
        createdAt: 1,
      },
    } satisfies McpCreateBoardResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpCreateBoardResponse>();
    expect(fixture.board.retentionN).toBe(100);
  });

  it('mint_key mock satisfies McpMintKeyResponse', () => {
    const fixture = {
      ok: true,
      publicKey: 'pk_pong_abc',
      secretKey: 'sk_live_def',
      secretKeyPrefix: 'sk_live_def',
    } satisfies McpMintKeyResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpMintKeyResponse>();
  });

  it('update_board_config mock satisfies McpUpdateBoardConfigResponse', () => {
    const fixture = {
      ok: true,
      board: {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'high-scores',
        name: 'High Scores',
        sortDir: 'desc',
        scoreKind: 'integer',
        retentionPolicy: 'all',
        retentionN: null,
        minScore: null,
        maxScore: 300,
        createdAt: 1,
      },
    } satisfies McpUpdateBoardConfigResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpUpdateBoardConfigResponse>();
    expect(fixture.board.maxScore).toBe(300);
  });

  it('update_game_config mock satisfies McpUpdateGameConfigResponse', () => {
    const fixture = {
      ok: true,
      gameId: '11111111-1111-4111-8111-111111111111',
      allowedOrigins: ['https://yourgame.com', '*.yourgame.dev'],
    } satisfies McpUpdateGameConfigResponse;
    expectTypeOf(fixture).toMatchTypeOf<McpUpdateGameConfigResponse>();
    expect(fixture.allowedOrigins).toHaveLength(2);
  });

  it('keys: secret-key plaintext is always null at the contract level', () => {
    const sk: McpKeySummary = {
      id: 'k',
      kind: 'secret',
      prefix: 'sk_live_aaaa',
      plaintext: null,
      lastRotatedAt: null,
      revokedAt: null,
      createdAt: 0,
    };
    // The contract says `plaintext: string | null`. The handler's
    // invariant — secret-key plaintext is NEVER returned over MCP —
    // is enforced server-side. This test pins our local intuition
    // that we encode `null` for secrets in fixtures.
    expect(sk.plaintext).toBeNull();
  });
});
