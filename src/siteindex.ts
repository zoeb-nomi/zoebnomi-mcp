// Builds the evidence index from whatever the site says right now.
//
// Two layers:
// 1. Auto entries parsed from llms.txt: every key-fact clause, every page,
//    essay and note line, each quoted exactly from the text with the URL it
//    points to. New site content appears here with no code change.
// 2. Curated claims (src/data/claims.ts) on top: hand-anchored quotes with n and
//    date. A curated claim is kept only while its quote is still on the page it
//    came from; if the site changes, it drops out and the index says so.

import { CLAIMS, type Claim } from './data/claims.ts';
import type { Site } from './site.ts';
import { SITE } from './site.ts';
import { contentTokens, normalizeDashes, numbers } from './text.ts';

export interface Entry {
  id: string;
  topic: string;
  claim: string;
  quote: string;
  source_url: string;
  evidence: string;
  n: string | null;
  date: string | null;
  curated: boolean;
  toks: Set<string>;
  nums: Set<string>;
}

export interface Listing {
  kind: 'case-study' | 'page' | 'writing' | 'note' | 'record';
  title: string;
  summary: string;
  url: string;
}

export interface Index {
  entries: Entry[];
  listings: Listing[];
  meta: {
    source: 'live' | 'snapshot' | 'mixed';
    fetched_at: string;
    snapshot_date: string;
    entries: number;
    curated_kept: number;
    curated_dropped: string[];
  };
  idf: (t: string) => number;
}

const RECORD = `${SITE}/about/#record`;
const URL_RE = /https?:\/\/[^\s),;]+/;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function mk(id: string, topic: string, quote: string, sourceUrl: string, evidence: string, curated = false, n: string | null = null, date: string | null = null, claim = quote): Entry {
  return {
    id,
    topic,
    claim,
    quote,
    source_url: sourceUrl,
    evidence,
    n,
    date,
    curated,
    toks: new Set(contentTokens(`${topic} ${claim} ${quote}`)),
    nums: new Set(numbers(normalizeDashes(`${claim} ${quote}`))),
  };
}

// Split a fact into quotable clauses. Every clause is a substring of the line.
function clauses(text: string): string[] {
  return text
    .split(/;\s+|(?<=[a-z0-9)%"])\.\s+(?=[A-Z])/)
    .map((c) => c.trim().replace(/\.$/, ''))
    .filter((c) => c.length >= 25 && /[a-z]/i.test(c));
}

export function parseLlms(text: string, url: string): { entries: Entry[]; listings: Listing[] } {
  const entries: Entry[] = [];
  const listings: Listing[] = [];
  let section = '';
  const seen = new Set<string>();
  const add = (topic: string, quote: string, evidence: string) => {
    if (seen.has(quote) || !text.includes(quote)) return;
    seen.add(quote);
    entries.push(mk(`auto:${slug(topic)}:${entries.length}`, topic, quote, url, evidence));
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      section = line.slice(3).toLowerCase();
      continue;
    }
    if (line.startsWith('> ')) {
      for (const c of clauses(line.slice(2))) add('Summary', c, RECORD);
      continue;
    }
    if (!line.startsWith('- ')) continue;
    const body = line.slice(2);
    const firstUrl = body.match(URL_RE)?.[0];

    if (section === 'pages') {
      // - Writing: "Title" (summary): URL    - Notes: "Title" (finding): URL    - Label: URL
      const m = body.match(/^(Writing|Notes):\s*"([^"]+)"\s*\((.*)\):\s*(https?:\/\/\S+)$/);
      if (m) {
        const kind = m[1] === 'Writing' ? 'writing' : 'note';
        listings.push({ kind, title: m[2], summary: m[3], url: m[4] });
        add(kind === 'writing' ? 'Writing' : 'Note', `"${m[2]}" (${m[3]})`, m[4]);
        continue;
      }
      const p = body.match(/^([^:]+?)(?:\s*\((.*)\))?:\s*(https?:\/\/\S+)$/);
      if (p) {
        const isCase = /case study/i.test(p[1]);
        listings.push({ kind: isCase ? 'case-study' : 'page', title: p[1].replace(/ case study$/i, ''), summary: p[2] ?? '', url: p[3] });
        if (p[2]) add(p[1], p[2], p[3]);
      }
      continue;
    }

    if (section === 'public record') {
      const title = body.replace(/:\s*https?:\/\/\S+$/, '');
      if (firstUrl) listings.push({ kind: 'record', title, summary: '', url: firstUrl });
      add('Public record', title, firstUrl ?? RECORD);
      continue;
    }

    // Key facts: "- Label: text" (or "- name (url): text"). The label is the topic; each clause is an entry.
    const k = body.match(/^([^:]{2,60}):\s+(.*)$/);
    const topic = k ? k[1] : (body.match(/^([^\s(:]+)/)?.[1] ?? 'Fact');
    const rest = k ? k[2] : body;
    const career = /^(Role|Previously|At Instead|Education)/i.test(topic);
    const urls = [...body.matchAll(new RegExp(URL_RE.source, 'g'))].map((m) => ({ url: m[0], at: m.index! }));
    for (const c of clauses(rest)) {
      // Evidence: a link inside the clause, else the next link in the bullet, else the previous one.
      const start = body.indexOf(c);
      const end = start + c.length;
      const inside = urls.find((u) => u.at >= start && u.at < end);
      const next = urls.find((u) => u.at >= end);
      const prev = [...urls].reverse().find((u) => u.at < start);
      add(topic, c, career ? RECORD : (inside ?? next ?? prev)?.url ?? RECORD);
    }
  }
  return { entries, listings };
}

export function buildIndex(site: Site): Index {
  const curatedKept: Entry[] = [];
  const dropped: string[] = [];
  for (const c of CLAIMS as Claim[]) {
    const page = site.pages[c.source];
    if (page && page.text.includes(c.quote)) {
      curatedKept.push(mk(c.id, c.topic, c.quote, page.url, c.evidence, true, c.n ?? null, c.date ?? null, c.claim));
    } else dropped.push(c.id);
  }
  const llms = site.pages['llms.txt'];
  const auto = parseLlms(llms.text, llms.url);
  // An auto clause wholly inside a curated quote adds nothing; keep the curated one.
  const autoEntries = auto.entries.filter((a) => !curatedKept.some((c) => c.quote.includes(a.quote)));
  const entries = [...curatedKept, ...autoEntries];

  const df = new Map<string, number>();
  for (const e of entries) for (const t of e.toks) df.set(t, (df.get(t) ?? 0) + 1);
  const N = entries.length;
  const origins = new Set(Object.values(site.pages).map((p) => p.origin));

  return {
    entries,
    listings: auto.listings,
    meta: {
      source: origins.size > 1 ? 'mixed' : (origins.values().next().value as 'live' | 'snapshot'),
      fetched_at: site.fetched_at,
      snapshot_date: site.snapshot_date,
      entries: entries.length,
      curated_kept: curatedKept.length,
      curated_dropped: dropped,
    },
    idf: (t: string) => Math.log(1 + N / (1 + (df.get(t) ?? 0))),
  };
}

// One index per loaded site; loadSite() caches the site, so this rebuilds only when the site is re-read.
const built = new WeakMap<Site, Index>();
export async function currentIndex(fetchImpl?: typeof fetch): Promise<Index> {
  const { loadSite } = await import('./site.ts');
  const site = await loadSite(fetchImpl);
  let ix = built.get(site);
  if (!ix) {
    ix = buildIndex(site);
    built.set(site, ix);
  }
  return ix;
}
