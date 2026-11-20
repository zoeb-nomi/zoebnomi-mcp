// The portfolio is the source: the tools follow the live site, fall back to
// the snapshot, drop curated claims the site no longer states, and redact.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SNAPSHOT } from '../src/data/snapshot.ts';
import { fitToRole } from '../src/fit.ts';
import { clearSiteCache, loadSite } from '../src/site.ts';
import { buildIndex, currentIndex } from '../src/siteindex.ts';
import { verifyClaim } from '../src/verify.ts';

// A fake zoebnomi.com: llms.txt can be edited per test; HTML pages are served from the snapshot text.
function fakeSite(llms: string): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.endsWith('/llms.txt')) return new Response(llms);
    const key = Object.keys(SNAPSHOT).find((k) => SNAPSHOT[k].url === url);
    return key ? new Response(`<main><p>${SNAPSHOT[key].text.replace(/\n/g, '</p><p>')}</p></main>`) : new Response('', { status: 404 });
  };
}
const down: typeof fetch = async () => {
  throw new Error('offline');
};

const NEW_NOTE =
  '- Notes: "Ninety-one of 412 refusals were a yes." (91 of 412 refusals were a yes.): https://www.zoebnomi.com/notes/ninety-one-refusals/';

test('a new note on the live site is found by verify_claim and listed, with no code change', async () => {
  clearSiteCache();
  const llms = SNAPSHOT['llms.txt'].text + '\n' + NEW_NOTE + '\n';
  const site = await loadSite(fakeSite(llms));
  assert.equal(site.pages['llms.txt'].origin, 'live');
  const ix = buildIndex(site);
  const r = verifyClaim('91 of 412 refusals were a yes', ix);
  assert.equal(r.status, 'found');
  assert.equal(r.match?.evidence, 'https://www.zoebnomi.com/notes/ninety-one-refusals/');
  assert.ok(ix.listings.some((l) => l.kind === 'note' && /Ninety-one/.test(l.title)));
  assert.equal(verifyClaim('92 of 412 refusals were a yes', ix).status, 'number_mismatch');
});

test('a curated claim the site no longer states is dropped, and reported', async () => {
  clearSiteCache();
  const llms = SNAPSHOT['llms.txt'].text.replaceAll('28 US enterprise clients', '31 US enterprise clients');
  const ix = buildIndex(await loadSite(fakeSite(llms)));
  assert.ok(ix.meta.curated_dropped.includes('keka-bgv'));
  const r = verifyClaim('Keka background verification had 28 US enterprise clients', ix);
  assert.notEqual(r.match?.id, 'keka-bgv');
  assert.equal(r.status, 'number_mismatch'); // the site now says 31
});

test('site down: every page falls back to the snapshot and the tools still answer', async () => {
  clearSiteCache();
  const ix = await currentIndex(down);
  assert.equal(ix.meta.source, 'snapshot');
  assert.equal(ix.meta.curated_dropped.length, 0);
  assert.equal(verifyClaim('screener-eval made 885 calls', ix).status, 'found');
  clearSiteCache();
});

test('live text is redacted before it reaches any tool', async () => {
  clearSiteCache();
  const llms = SNAPSHOT['llms.txt'].text + '\n- Contact: someone@example.com · https://calendar.app.google/abc\nBased in Somewhere, Nowhere.\n';
  const site = await loadSite(fakeSite(llms));
  assert.ok(!/example\.com|calendar\.app\.google|Based in/.test(site.pages['llms.txt'].text));
  clearSiteCache();
});

test('fit_to_role picks up new site content as evidence', async () => {
  clearSiteCache();
  const extra =
    '- Retrieval study: rag-bench (https://github.com/zoeb-nomi/rag-bench), retrieval and citation evaluation of 3 rerankers on 900 RAG queries with grounding checks.';
  const llms = SNAPSHOT['llms.txt'].text.replace('\n## Public record', `\n${extra}\n\n## Public record`);
  const ix = buildIndex(await loadSite(fakeSite(llms)));
  const r = fitToRole('- Experience improving RAG retrieval and citation grounding.', ix);
  const rag = r.matches.find((m) => /RAG/.test(m.capability));
  assert.ok(rag?.evidence.some((e) => e.evidence === 'https://github.com/zoeb-nomi/rag-bench'), JSON.stringify(rag?.evidence.map((e) => e.evidence)));
  clearSiteCache();
});
