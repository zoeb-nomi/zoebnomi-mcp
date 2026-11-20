// House rules as tests: every quote is on the site, no dashes, no banned
// overstatements, no personal or availability details in anything shipped.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLAIMS } from '../src/data/claims.ts';
import { SNAPSHOT } from '../src/data/snapshot.ts';
import { caseStudiesMd, llmsTxt, writingMd } from '../src/content.ts';
import { snapshotSite } from '../src/site.ts';
import { buildIndex } from '../src/siteindex.ts';

const site = snapshotSite();
const ix = buildIndex(site);
const resources = () => [llmsTxt(site, ix), caseStudiesMd(ix), writingMd(ix)];
import { numbers } from '../src/text.ts';

const ROOT = new URL('..', import.meta.url).pathname;

test('every quote is an exact substring of its snapshot', () => {
  for (const c of CLAIMS) assert.ok(SNAPSHOT[c.source].text.includes(c.quote), `${c.id}: quote not found in ${c.source}`);
});

test('claim ids are unique', () => {
  assert.equal(new Set(CLAIMS.map((c) => c.id)).size, CLAIMS.length);
});

test('n is a number the site states; date appears in the source text', () => {
  for (const c of CLAIMS) {
    if (c.n) assert.ok(numbers(SNAPSHOT[c.source].text).includes(c.n), `${c.id}: n=${c.n} not on the page`);
    if (c.date) assert.ok(SNAPSHOT[c.source].text.includes(c.date), `${c.id}: date ${c.date} not on the page`);
  }
});

function shippedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '.wrangler', '.wrangler-dry', 'upload', 'data'].includes(name) && dir === ROOT) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...shippedFiles(p));
    else if (/\.(ts|mjs|md|json|toml)$/.test(name) && !name.endsWith('.jsonl') && name !== 'package-lock.json') out.push(p);
  }
  return out;
}

test('no en or em dashes in shipped text', () => {
  const generated = [...resources(), ...ix.entries.map((e) => e.quote + e.claim)];
  for (const t of generated) assert.ok(!/[\u2013\u2014]/.test(t), `dash in generated text: ${t.slice(0, 80)}`);
  for (const f of shippedFiles(ROOT)) {
    if (f.includes('/eval/data/')) continue; // third-party court text
    assert.ok(!/[\u2013\u2014]/.test(readFileSync(f, 'utf8')), `dash in ${f}`);
  }
});

test('no banned overstatements or personal details anywhere shipped', () => {
  const banned = [
    /first new entrant in 20 years/i,
    /built 100\+ integrations/i,
    /1,?200\+ agent runs/i,
    /bengaluru|bangalore/i,
    /calendar\.app\.google/i,
    /@gmail\.com/i,
  ];
  const generated = [...resources(), ...ix.entries.map((e) => e.quote)].join('\n');
  for (const b of banned) assert.ok(!b.test(generated), `resource text matches ${b}`);
  for (const c of CLAIMS) for (const b of banned) assert.ok(!b.test(c.quote + c.claim), `${c.id} matches ${b}`);
  for (const f of shippedFiles(ROOT)) {
    if (f.includes('/test/') || f.includes('/eval/')) continue;
    const t = readFileSync(f, 'utf8');
    for (const b of banned) assert.ok(!b.test(t), `${f} matches ${b}`);
  }
  assert.ok(generated.length > 0);
});
