// End to end through the MCP SDK client: list and call every tool and read
// every resource, over in-memory (same code path as stdio) and over Streamable
// HTTP through the Worker's fetch handler.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { buildServer } from '../src/server.ts';
import { handle } from '../src/worker.ts';
import { clearSiteCache } from '../src/site.ts';
import { clearLedgerCache } from '../src/ledger.ts';

// Offline: the ledger answers with a fixed summary; the site does not answer, so the snapshot is used.
const fakeLedger: typeof fetch = async (input) => {
  if (!String(input).includes('agent-ledger')) throw new Error('offline');
  return Response.json({
    generated_at: '2026-11-20T00:00:00Z',
    live: { day: '2026-11-20', tz: 'Asia/Kolkata', agent_runs_today: 3, subagent_runs_today: 2 },
    outcomes: { since: '2026-11-10', shipped_7d: 5, caught_7d: 1, cost: { all_in_per_shipped_usd: 0.5 } },
  });
};

const ANSWER = {
  answer: 'The warrantless car search violated the Fourth Amendment [smith:0]. Duress makes contracts voidable [smith:1].',
  sources: [
    { id: 'smith:0', text: 'The court held that the search of the car without a warrant violated the Fourth Amendment.' },
    { id: 'smith:1', text: 'The defendant was sentenced to five years in prison.' },
    { id: 'jones:0', text: 'Contracts signed under duress are voidable at the option of the party who was coerced.' },
  ],
};

async function exercise(client: Client) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['check_citations', 'fit_to_role', 'verify_claim']);
  for (const t of tools) {
    assert.ok(t.title, `${t.name} has a title`);
    assert.equal(t.annotations?.readOnlyHint, true);
    assert.equal(t.annotations?.destructiveHint, false);
    assert.equal(t.annotations?.openWorldHint, false);
  }

  const cc = (await client.callTool({ name: 'check_citations', arguments: ANSWER })) as { structuredContent: any };
  assert.equal(cc.structuredContent.citations.length, 2);
  assert.equal(cc.structuredContent.citations[0].verdict, 'needs_judgment');
  assert.equal(cc.structuredContent.citations[1].verdict, 'wrong_document');

  const vc = (await client.callTool({ name: 'verify_claim', arguments: { claim: 'screener-eval made 885 calls' } })) as { structuredContent: any };
  assert.equal(vc.structuredContent.status, 'found');

  const fit = (await client.callTool({
    name: 'fit_to_role',
    arguments: { job_description: '- Build evaluation datasets and LLM-as-a-judge pipelines.\n- Experience with Rust systems programming.' },
  })) as { structuredContent: any };
  assert.equal(fit.structuredContent.summary.requirements, 2);
  assert.equal(fit.structuredContent.summary.gaps, 1);

  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri).sort(), ['zoebnomi://case-studies', 'zoebnomi://harness', 'zoebnomi://llms.txt', 'zoebnomi://writing']);
  for (const r of resources) {
    const res = await client.readResource({ uri: r.uri });
    const text = (res.contents[0] as { text: string }).text;
    assert.ok(text.length > 40, `${r.uri} has content`);
  }
}

test('in-memory (stdio code path): every tool and resource', async () => {
  clearLedgerCache();
  const server = buildServer({ fetchImpl: fakeLedger });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    await exercise(client);
    const harness = await client.readResource({ uri: 'zoebnomi://harness' });
    assert.match((harness.contents[0] as { text: string }).text, /3 agent runs/);
  } finally {
    await client.close();
  }
});

test('Streamable HTTP through the Worker handler: every tool and resource, plus /health', async () => {
  const realFetch = globalThis.fetch;
  // The Worker reads the site and the ledger with global fetch; keep the test offline.
  globalThis.fetch = fakeLedger;
  clearSiteCache();
  try {
    // Offline, the site falls back to the snapshot, so health reports degraded (503) but tools still work.
    const health = await handle(new Request('https://x.test/health'));
    assert.equal(health.status, 503);
    const h = (await health.json()) as { ok: boolean; site: { source: string } };
    assert.equal(h.ok, false);
    assert.equal(h.site.source, 'snapshot');
    const transport = new StreamableHTTPClientTransport(new URL('https://x.test/mcp'), {
      fetch: (input, init) => handle(new Request(input as string | URL, init)),
    });
    const client = new Client({ name: 'test-http', version: '0' });
    await client.connect(transport);
    try {
      await exercise(client);
    } finally {
      await client.close();
    }
  } finally {
    globalThis.fetch = realFetch;
    clearSiteCache();
  }
});

test('use_client_model: needs_judgment items are judged through MCP sampling', async () => {
  const server = buildServer({ fetchImpl: fakeLedger });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'sampler', version: '0' }, { capabilities: { sampling: {} } });
  let prompts = 0;
  client.setRequestHandler(CreateMessageRequestSchema, async (req) => {
    prompts++;
    assert.match(String((req.params.messages[0].content as { text: string }).text), /CITED PASSAGE/);
    return { model: 'fake-judge', role: 'assistant', content: { type: 'text', text: '{"supported": true, "failure_label": "none", "reason": "The passage states it."}' } };
  });
  await Promise.all([server.connect(a), client.connect(b)]);
  const r = (await client.callTool({ name: 'check_citations', arguments: { ...ANSWER, use_client_model: true } }).finally(() => client.close())) as { structuredContent: any };
  assert.equal(prompts, 1);
  assert.equal(r.structuredContent.citations[0].verdict, 'supported');
  assert.equal(r.structuredContent.citations[0].rule, 'judge:fake-judge');
  assert.equal(r.structuredContent.citations[1].verdict, 'wrong_document');
  assert.equal(r.structuredContent.judged_by_client_model, 1);
});

test('OpenAI domain-verification path serves the configured token, else 404', async () => {
  const none = await handle(new Request('https://mcp.zoebnomi.com/.well-known/openai-apps-challenge'));
  assert.equal(none.status, 404);
  const set = await handle(new Request('https://mcp.zoebnomi.com/.well-known/openai-apps-challenge'), { OPENAI_APPS_CHALLENGE: 'tok_123' });
  assert.equal(set.status, 200);
  assert.equal(await set.text(), 'tok_123');
});
