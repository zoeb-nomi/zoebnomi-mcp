import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitToRole as fit } from '../src/fit.ts';
import { snapshotSite } from '../src/site.ts';
import { buildIndex } from '../src/siteindex.ts';
import { verifyClaim as verify } from '../src/verify.ts';

const ix = buildIndex(snapshotSite());
const verifyClaim = (c: string) => verify(c, ix);

test('verify_claim: found returns the site quote, source, evidence and n', () => {
  const r = verifyClaim('CrossSource strict prompting lifted citation precision to 0.994');
  assert.equal(r.status, 'found');
  assert.equal(r.match?.id, 'cs-v01-precision');
  assert.equal(r.match?.n, '25');
  assert.match(r.match!.source_url, /zoebnomi\.com/);
});

test('verify_claim: a wrong number is number_mismatch with the right quote', () => {
  const r = verifyClaim('Keka background verification had 30 US enterprise clients');
  assert.equal(r.status, 'number_mismatch');
  assert.deepEqual(r.numbers_not_on_site, ['30']);
  assert.match(r.message, /28 US enterprise clients/);
});

test('verify_claim: "100+" never matches "$100K"', () => {
  assert.notEqual(verifyClaim('He built 100+ integrations at Multiplier').status, 'found');
});

test('verify_claim: unrelated claims are not_found', () => {
  assert.equal(verifyClaim('He holds a PhD in computer science').status, 'not_found');
});

const JD = `About us
We build AI products for finance teams.

What you'll do
- Own evaluation strategy for our LLM features: golden datasets, LLM-as-a-judge, human review.
- Ship agentic workflows with guardrails into production and track latency and quality.
- Partner with legal and compliance on regulated use cases.

What you bring
- 5+ years of product management experience.
- Experience with Kubernetes cost optimisation.
- Fluency in Japanese.

Salary range: $200k to $250k. Visa sponsorship available. Hybrid, 3 days in office.`;

test('fit_to_role: maps requirements to quoted evidence and lists gaps honestly', () => {
  const r = fit(JD, ix);
  const caps = r.matches.map((m) => m.capability);
  assert.ok(caps.some((c) => /Evals/.test(c)));
  assert.ok(caps.some((c) => /judge/.test(c)));
  assert.ok(caps.some((c) => /workflows/.test(c)));
  assert.ok(caps.some((c) => /Regulated/.test(c)));
  assert.ok(r.gaps.some((g) => /Japanese/.test(g.jd_line)));
  for (const m of r.matches) for (const e of m.evidence) assert.ok(e.quote.length > 10 && /^https:\/\//.test(e.evidence));
  assert.ok(r.summary.coverage > 0 && r.summary.coverage < 1);
});

test('fit_to_role: never echoes compensation, visa or location lines', () => {
  const r = fit(JD, ix);
  const text = JSON.stringify(r);
  assert.ok(!/200k|250k|sponsorship available|3 days in office/i.test(text));
  assert.equal(r.summary.out_of_scope, 3);
});
