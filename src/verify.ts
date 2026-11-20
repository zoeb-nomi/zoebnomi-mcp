// verify_claim: look a claim up against what zoebnomi.com says right now.
// Deterministic: IDF-weighted word coverage finds the closest site statement,
// then a strict number check. It is a lookup, not a judge: "found" means the
// site has a statement on this, and callers should repeat the site's quote.

import type { Entry, Index } from './siteindex.ts';
import { contentTokens, normalizeDashes, numbers, unique } from './text.ts';

export type VerifyStatus = 'found' | 'number_mismatch' | 'not_found';

export interface Match {
  id: string;
  topic: string;
  quote: string;
  source_url: string;
  evidence: string;
  n: string | null;
  date: string | null;
  curated: boolean;
  score: number;
}

export interface VerifyResult {
  status: VerifyStatus;
  claim: string;
  message: string;
  match: Match | null;
  numbers_not_on_site: string[];
  alternatives: Match[];
  index: Index['meta'];
}

// Fixed before the golden set was run (eval/data/verify_claim_golden.jsonl).
export const VERIFY_THRESHOLD = 0.45;

function toMatch(e: Entry, score: number): Match {
  return {
    id: e.id,
    topic: e.topic,
    quote: e.quote,
    source_url: e.source_url,
    evidence: e.evidence,
    n: e.n,
    date: e.date,
    curated: e.curated,
    score: Math.round(score * 1000) / 1000,
  };
}

export function rank(query: string, index: Index): Array<{ e: Entry; lex: number }> {
  const q = unique(contentTokens(normalizeDashes(query))).filter((t) => !/^\d/.test(t));
  const total = q.reduce((a, t) => a + index.idf(t), 0);
  if (!total) return [];
  return index.entries
    .map((e) => ({ e, lex: q.filter((t) => e.toks.has(t)).reduce((a, t) => a + index.idf(t), 0) / total }))
    .sort((a, b) => b.lex - a.lex);
}

export function verifyClaim(claim: string, index: Index): VerifyResult {
  const qNums = unique(numbers(normalizeDashes(claim)));
  const ranked = rank(claim, index).map((r) => {
    const numHit = qNums.length ? qNums.filter((n) => r.e.nums.has(n)).length / qNums.length : 0;
    // Numbers break ties between statements on the same topic; words decide whether there is a match at all.
    return { ...r, score: qNums.length ? 0.75 * r.lex + 0.25 * numHit : r.lex };
  });
  // Ties go to curated claims (they carry n and date).
  ranked.sort((a, b) => b.score - a.score || Number(b.e.curated) - Number(a.e.curated));
  const top = ranked[0];
  const base = { claim, index: index.meta };
  if (!top || top.lex < VERIFY_THRESHOLD) {
    return {
      ...base,
      status: 'not_found',
      message: 'No statement on zoebnomi.com matches this. Do not attribute it to Zoeb Nomi. The closest statements are listed for reference.',
      match: null,
      numbers_not_on_site: qNums,
      alternatives: ranked.slice(0, 3).map((r) => toMatch(r.e, r.score)),
    };
  }
  const missing = qNums.filter((n) => !top.e.nums.has(n));
  const match = toMatch(top.e, top.score);
  const alternatives = ranked
    .slice(1)
    .filter((r) => r.lex >= VERIFY_THRESHOLD && r.e.quote !== top.e.quote)
    .slice(0, 2)
    .map((r) => toMatch(r.e, r.score));
  if (missing.length) {
    return {
      ...base,
      status: 'number_mismatch',
      message: `zoebnomi.com has a statement on this, but not with ${missing.join(', ')}. Use the site's wording: "${top.e.quote}"`,
      match,
      numbers_not_on_site: missing,
      alternatives,
    };
  }
  return {
    ...base,
    status: 'found',
    message: `Closest statement on zoebnomi.com. Repeat the site's wording, not a paraphrase: "${top.e.quote}"`,
    match,
    numbers_not_on_site: [],
    alternatives,
  };
}
