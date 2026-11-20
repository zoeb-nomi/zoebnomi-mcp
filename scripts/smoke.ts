// Smoke test and deploy-verify: /health, then an MCP client lists the tools,
// calls each one and reads each resource over Streamable HTTP.
//
//   node scripts/smoke.ts https://<worker-host>        a deployed Worker
//   node scripts/smoke.ts bundle .wrangler-dry/worker.js  the built bundle, in-process
//   node scripts/smoke.ts                             src/worker.ts, in-process
//
// Exit 0 only if every check passes.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [mode, arg] = process.argv.slice(2);
let base = 'https://local.test';
let fetchImpl: typeof fetch = fetch;
if (!mode || mode === 'bundle') {
  const mod = mode === 'bundle' ? await import(pathToFileURL(resolve(arg ?? '.wrangler-dry/worker.js')).href) : await import('../src/worker.ts');
  const worker = mod.default as { fetch: (r: Request) => Promise<Response> };
  fetchImpl = (input, init) => worker.fetch(new Request(input as string | URL, init));
} else base = mode.replace(/\/$/, '');

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
};

const health = await fetchImpl(`${base}/health`);
const h = (await health.json()) as { ok?: boolean; version?: string; snapshot_date?: string };
check('/health', health.status === 200 && h.ok === true, `version ${h.version}, snapshot ${h.snapshot_date}`);

const client = new Client({ name: 'zoebnomi-smoke', version: '0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { fetch: fetchImpl }));
const { tools } = await client.listTools();
check('tools/list', tools.length === 3, tools.map((t) => t.name).join(', '));

const cc = (await client.callTool({
  name: 'check_citations',
  arguments: {
    answer: 'Duress makes contracts voidable [a:0].',
    sources: [
      { id: 'a:0', text: 'The defendant was sentenced to five years.' },
      { id: 'b:0', text: 'Contracts signed under duress are voidable by the coerced party.' },
    ],
  },
})) as { structuredContent?: { citations?: { verdict: string }[] } };
check('check_citations', cc.structuredContent?.citations?.[0]?.verdict === 'wrong_document');

const vc = (await client.callTool({ name: 'verify_claim', arguments: { claim: 'CrossSource lifted citation precision to 0.994' } })) as {
  structuredContent?: { status?: string };
};
check('verify_claim', vc.structuredContent?.status === 'found');

const fit = (await client.callTool({ name: 'fit_to_role', arguments: { job_description: '- Own evals and golden datasets for LLM features.' } })) as {
  structuredContent?: { summary?: { with_evidence?: number } };
};
check('fit_to_role', fit.structuredContent?.summary?.with_evidence === 1);

const { resources } = await client.listResources();
check('resources/list', resources.length === 4);
for (const r of resources) {
  const res = await client.readResource({ uri: r.uri });
  const text = (res.contents[0] as { text?: string }).text ?? '';
  check(`read ${r.uri}`, text.length > 40, r.uri === 'zoebnomi://harness' ? text.split('\n')[4] ?? '' : '');
}
await client.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
