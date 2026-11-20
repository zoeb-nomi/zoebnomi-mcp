// Pre-deploy review fixes (2026-11-20): request limits, health status, caching, redaction.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCitations, LIMITS } from '../src/citations.ts';
import { SNAPSHOT } from '../src/data/snapshot.ts';
import { clearLedgerCache, harnessSummary } from '../src/ledger.ts';
import { clearSiteCache, loadSite, redact } from '../src/site.ts';
import { handle, healthOf, MAX_BATCH, MAX_BODY_BYTES } from '../src/worker.ts';

const offline: typeof fetch = async () => {
  throw new Error('offline');
};

test('largest allowed check_citations input stays fast and bounded', () => {
  const sources = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}:0`, text: 'Contracts signed under duress are voidable by the coerced party. '.repeat(190).slice(0, 12_000) }));
  const answer = Array.from({ length: 800 }, (_, i) => `Claim ${i} about duress and contracts [d${i % 30}:0].`).join(' ').slice(0, 30_000);
  const t0 = performance.now();
  const r = checkCitations(answer, sources);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
  assert.equal(r.citations.length, LIMITS.citations);
  assert.ok(r.summary.notes?.some((n) => /first 50/.test(n)));
  const prompts = r.citations.filter((c) => c.judge_prompt);
  assert.ok(prompts.length <= LIMITS.judgePrompts);
  for (const c of prompts) assert.ok(c.judge_prompt!.user.length < (LIMITS.judgeOthers + 1) * (LIMITS.judgePassageChars + 40) + 2000);
  assert.ok(JSON.stringify(r).length < 1_000_000);
});

test('an answer with no brackets does not hang (old tail regex was quadratic)', () => {
  const t0 = performance.now();
  checkCitations('word. '.repeat(5000), []);
  assert.ok(performance.now() - t0 < 200);
});

test('the judge sees at most 4 other passages, clipped', () => {
  const sources = [
    { id: 'a:0', text: 'The search of the car violated the Fourth Amendment.' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `b:${i}`, text: `Unrelated passage ${i}. `.repeat(400) })),
  ];
  const c = checkCitations('The car search violated the Fourth Amendment [a:0].', sources).citations[0];
  assert.equal((c.judge_prompt!.user.match(/^\[b:\d\]$/gm) ?? []).length, 4);
  assert.match(c.judge_prompt!.user, /\[passage truncated\]/);
});

const post = (body: string, headers: Record<string, string> = {}) =>
  handle(new Request('https://mcp.zoebnomi.com/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body }));

test('large JSON-RPC batches and oversized bodies are refused', async () => {
  const batch = JSON.stringify(Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/list' })));
  const r1 = await post(batch);
  assert.equal(r1.status, 400);
  assert.match(((await r1.json()) as { error: { message: string } }).error.message, /Batches/);
  const r2 = await post('x'.repeat(MAX_BODY_BYTES + 1));
  assert.equal(r2.status, 413);
  assert.equal(r2.headers.get('x-content-type-options'), 'nosniff');
});

test('/health is 503 with reasons when the site was not read live', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = offline;
  clearSiteCache();
  try {
    const r = await handle(new Request('https://mcp.zoebnomi.com/health'));
    assert.equal(r.status, 503);
    const h = (await r.json()) as { ok: boolean; problems: string[] };
    assert.equal(h.ok, false);
    assert.ok(h.problems.some((p) => /not read live/.test(p)));
  } finally {
    globalThis.fetch = realFetch;
    clearSiteCache();
  }
});

test('healthOf flags an llms.txt format change that empties the listings', () => {
  assert.deepEqual(healthOf({ source: 'live', entries: 111, curated_dropped: [] }, [{ kind: 'case-study' }, { kind: 'writing' }, { kind: 'note' }]), []);
  const p = healthOf({ source: 'live', entries: 30, curated_dropped: [] }, [{ kind: 'case-study' }]);
  assert.ok(p.some((x) => /only 30/.test(x)) && p.some((x) => /no writing/.test(x)) && p.some((x) => /no note/.test(x)));
});

test('concurrent cold loads share one fetch of each page', async () => {
  clearSiteCache();
  let calls = 0;
  const counting: typeof fetch = async () => {
    calls++;
    throw new Error('offline');
  };
  await Promise.all([loadSite(counting), loadSite(counting), loadSite(counting)]);
  assert.equal(calls, 4);
  clearSiteCache();
});

test('the ledger is read at most once a minute, and errors stay generic', async () => {
  clearLedgerCache();
  let calls = 0;
  const failing: typeof fetch = async () => {
    calls++;
    throw new TypeError('secret internal detail');
  };
  const a = await harnessSummary(failing, 100, 1_000_000);
  const b = await harnessSummary(failing, 100, 1_030_000);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.ok(!/secret internal detail/.test(a));
  clearLedgerCache();
});

test('redaction drops phone, mail, booking and location lines but leaves the site text intact', () => {
  for (const [k, v] of Object.entries(SNAPSHOT)) assert.equal(redact(v.text), v.text, k);
  const t = ['Phone: x', 'Reach me at +91 98765 43210', 'call 98765 43210', '(415) 555-0134', 'mailto:x', 'tel:+1555', 'Location: X', 'wa.me/91', 'Keep 2026-08-06, 0 60 120 180 240, 1,414'].join('\n');
  assert.equal(redact(t).trim(), 'Keep 2026-08-06, 0 60 120 180 240, 1,414');
});
