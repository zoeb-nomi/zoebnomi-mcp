// check_citations: CrossSource's citation check as a free, deterministic tool.
//
// Reused from CrossSource (github.com/zoeb-nomi/crosssource, MIT, src/evaluate.py):
//   - the inline citation format [doc_id:chunk_id] and claim-span pairing,
//     including the fix for consecutive citations ("[a:1], [a:2]") that once
//     produced punctuation-only claims;
//   - the four-label failure taxonomy;
//   - "cited id not in the sources" => unsupported_claim, without a judge;
//   - the judge prompt, returned verbatim for anything this tool will not decide.
//
// New here: a lexical triage that decides only the cases word overlap can
// decide (the cited passage shares little with the claim while another passage
// covers it, or a number in the claim is absent from the cited passage). Every
// other citation comes back as needs_judgment with CrossSource's judge prompt,
// so the caller's model (or a human) makes the semantic call. Thresholds were
// tuned on the dev split of CrossSource v0.3 citation_check; see eval/.

import { contentTokens, normalizeDashes, numbers, unique } from './text.ts';

export type Label = 'supported' | 'right_doc_wrong_passage' | 'wrong_document' | 'unsupported_claim';
export type Verdict = Label | 'needs_judgment';

export interface Source {
  id: string;
  text: string;
  doc_id?: string;
}

export interface CitationResult {
  claim: string;
  citation: string;
  verdict: Verdict;
  supported: boolean | null;
  rule: string;
  reason: string;
  scores: {
    cited: number | null;
    best_same_doc: { id: string; score: number } | null;
    best_other_doc: { id: string; score: number } | null;
    numbers_missing_from_cited: string[];
  };
  judge_prompt?: { system: string; user: string };
}

export interface CheckResult {
  citations: CitationResult[];
  summary: {
    citations: number;
    decided: number;
    needs_judgment: number;
    by_verdict: Record<string, number>;
    uncited_text: boolean;
    notes?: string[];
  };
  method: string;
}

// Tuned on the dev split only (eval/run-eval.ts --split dev). Changing these
// means re-running the eval and updating the README numbers.
export const THRESHOLDS = {
  // Another passage must beat the cited one by this much coverage...
  margin: 0.25,
  // ...and itself cover at least this share of the claim's content words.
  strong: 0.6,
  // Below this coverage the result carries a "low overlap" flag (a hint only).
  weak: 0.35,
};

export const METHOD =
  'CrossSource citation check (github.com/zoeb-nomi/crosssource): claim spans paired with [doc_id:chunk_id] citations, ' +
  'four-label taxonomy. Deterministic triage decides only clear lexical cases; the rest return needs_judgment with ' +
  "CrossSource's judge prompt for your model to apply. Lexical overlap cannot see negation or a swapped standard, so " +
  'this tool never returns supported on its own.';

// CrossSource's pattern was \[([a-z0-9_]+:\d+)\]. Widened to any [id] or
// [id:n] so plain source ids work too; a markdown link "[text](url)" is not a citation.
const CITATION_RE = /\[([A-Za-z0-9_.\-]+(?::\d+)?)\](?!\()/g;

export function claimCitationPairs(answer: string): Array<[string, string]> {
  // Port of crosssource/src/evaluate.py claim_citation_pairs.
  const pairs: Array<[string, string]> = [];
  let lastEnd = 0;
  for (const m of answer.matchAll(CITATION_RE)) {
    let claim = answer.slice(lastEnd, m.index).trim();
    // citations separated only by punctuation/whitespace are continuation
    // citations for the previous claim span
    if (!/\w/.test(claim) && pairs.length) claim = pairs[pairs.length - 1][0];
    // keep the claim to its last ~2 sentences for a focused judgment
    const sentences = claim.split(/(?<=[.?!])\s+/);
    // (one deviation: drop punctuation left over from the previous citation's sentence)
    claim = sentences.slice(-2).join(' ').trim().replace(/^[\s.,;:!?)\]]+/, '');
    if (/\w/.test(claim)) pairs.push([claim, m[1]]);
    lastEnd = m.index! + m[0].length;
  }
  return pairs;
}

export function docId(s: Source): string {
  if (s.doc_id) return s.doc_id;
  const i = s.id.lastIndexOf(':');
  return i > 0 && /^\d+$/.test(s.id.slice(i + 1)) ? s.id.slice(0, i) : s.id;
}

// Share of the claim's distinct content words that appear in the passage.
export function coverage(claim: string, passage: string | Set<string>): number {
  const c = unique(contentTokens(claim));
  if (!c.length) return 0;
  const p = typeof passage === 'string' ? new Set(contentTokens(passage)) : passage;
  return c.filter((t) => p.has(t)).length / c.length;
}

// Limits that keep one call cheap on a public endpoint (Workers Free: 10 ms CPU).
export const LIMITS = {
  // citations checked per call; the rest are reported as not checked
  citations: 50,
  // judge prompts returned per call (each embeds passages)
  judgePrompts: 20,
  // other passages shown to the judge: CrossSource used the retrieved top 5 (cited + 4)
  judgeOthers: 4,
  // characters of each passage shown to the judge
  judgePassageChars: 4000,
};

const JUDGE_SYSTEM =
  'You are a meticulous auditor of a legal research assistant. Judge only from the text provided; never rely on outside knowledge.';

const clip = (t: string) => (t.length > LIMITS.judgePassageChars ? `${t.slice(0, LIMITS.judgePassageChars)} [passage truncated]` : t);

// crosssource/src/evaluate.py citation_prompt, verbatim, plus a JSON reply line
// (CrossSource enforced the shape with a schema; MCP sampling has no schema).
// Passages are clipped to LIMITS.judgePassageChars.
export function judgePrompt(claim: string, cited: Source, others: Source[]): { system: string; user: string } {
  const ctx = others.map((c) => `[${c.id}]\n${clip(c.text)}`).join('\n\n');
  const user = `A legal research assistant answered a question and attached a citation to a claim.

CLAIM:
${claim}

CITED PASSAGE [${cited.id}]:
${clip(cited.text)}

OTHER PASSAGES THE ASSISTANT HAD AVAILABLE:
${ctx}

Question 1: Does the CITED passage genuinely support the claim, such that a reader could verify the claim from that passage alone? (supported)
Question 2: If not supported, classify the failure:
- "right_doc_wrong_passage": another available passage from the SAME document supports the claim
- "wrong_document": an available passage from a DIFFERENT document supports the claim
- "unsupported_claim": no available passage supports the claim
Use "none" when supported is true.

Reply with JSON only: {"supported": true|false, "failure_label": "right_doc_wrong_passage"|"wrong_document"|"unsupported_claim"|"none", "reason": "<one sentence>"}`;
  return { system: JUDGE_SYSTEM, user };
}

// Each source is tokenised once per call, not once per citation.
interface Prepared {
  src: Source;
  doc: string;
  toks: Set<string>;
  nums: Set<string>;
}

export function prepare(sources: Source[]): Map<string, Prepared> {
  const out = new Map<string, Prepared>();
  for (const s of sources) {
    if (out.has(s.id)) continue;
    out.set(s.id, { src: s, doc: docId(s), toks: new Set(contentTokens(s.text)), nums: new Set(numbers(normalizeDashes(s.text))) });
  }
  return out;
}

export function checkOne(claim: string, citation: string, sources: Source[] | Map<string, Prepared>, t = THRESHOLDS, withPrompt = true): CitationResult {
  const prepared = sources instanceof Map ? sources : prepare(sources);
  const cited = prepared.get(citation);
  const empty = { cited: null, best_same_doc: null, best_other_doc: null, numbers_missing_from_cited: [] };
  if (!cited) {
    // CrossSource: a citation to a chunk the system never had is a failure, no judge needed.
    return {
      claim,
      citation,
      verdict: 'unsupported_claim',
      supported: false,
      rule: 'cited_id_not_in_sources',
      reason: 'The cited id is not among the sources provided (fabricated or mis-copied id).',
      scores: empty,
    };
  }

  const citedScore = coverage(claim, cited.toks);
  let bestSame: { id: string; score: number } | null = null;
  let bestOther: { id: string; score: number } | null = null;
  const others: Array<{ p: Prepared; score: number }> = [];
  for (const p of prepared.values()) {
    if (p.src.id === citation) continue;
    const score = coverage(claim, p.toks);
    others.push({ p, score });
    if (p.doc === cited.doc) {
      if (!bestSame || score > bestSame.score) bestSame = { id: p.src.id, score };
    } else if (!bestOther || score > bestOther.score) bestOther = { id: p.src.id, score };
  }
  const missingNums = unique(numbers(normalizeDashes(claim))).filter((n) => !cited.nums.has(n));
  const scores = {
    cited: round(citedScore),
    best_same_doc: bestSame && { id: bestSame.id, score: round(bestSame.score) },
    best_other_doc: bestOther && { id: bestOther.id, score: round(bestOther.score) },
    numbers_missing_from_cited: missingNums,
  };

  const best = [bestSame, bestOther].filter(Boolean).sort((a, b) => b!.score - a!.score)[0] ?? null;
  if (best && best.score >= t.strong && best.score - citedScore >= t.margin) {
    const sameDoc = best === bestSame;
    return {
      claim,
      citation,
      verdict: sameDoc ? 'right_doc_wrong_passage' : 'wrong_document',
      supported: false,
      rule: 'better_passage_elsewhere',
      reason:
        `The cited passage shares ${pct(citedScore)} of the claim's content words; [${best.id}] ` +
        `${sameDoc ? 'in the same document' : 'in a different document'} shares ${pct(best.score)}.`,
      scores,
    };
  }

  // Everything else needs a reader. Never "supported" from overlap alone: the
  // hardest CrossSource failures (a reversed outcome, a swapped standard) share
  // almost every word with the passage they misstate.
  const hints: string[] = [];
  if (missingNums.length) hints.push(`numbers in the claim not found in the cited passage: ${missingNums.join(', ')}`);
  if (citedScore <= t.weak) hints.push(`low overlap with the cited passage (${pct(citedScore)})`);
  // The judge sees the passages most likely to hold the claim, in their original order.
  const shown = new Set(
    [...others]
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMITS.judgeOthers)
      .map((o) => o.p),
  );
  const result: CitationResult = {
    claim,
    citation,
    verdict: 'needs_judgment',
    supported: null,
    rule: 'defer_to_judge',
    reason: hints.length ? `Needs a judgment; flags: ${hints.join('; ')}.` : 'Needs a judgment: overlap alone cannot tell support from a misstatement.',
    scores,
  };
  if (withPrompt) result.judge_prompt = judgePrompt(claim, cited.src, others.filter((o) => shown.has(o.p)).map((o) => o.p.src));
  return result;
}

export function checkCitations(answer: string, sources: Source[], opts: { includeJudgePrompts?: boolean } = {}): CheckResult {
  const all = claimCitationPairs(answer);
  const pairs = all.slice(0, LIMITS.citations);
  const prepared = prepare(sources);
  let prompts = 0;
  const citations = pairs.map(([claim, cid]) => {
    const withPrompt = opts.includeJudgePrompts !== false && prompts < LIMITS.judgePrompts;
    const r = checkOne(normalizeDashes(claim), cid, prepared, THRESHOLDS, withPrompt);
    if (r.judge_prompt) prompts++;
    return r;
  });
  const by: Record<string, number> = {};
  for (const c of citations) by[c.verdict] = (by[c.verdict] ?? 0) + 1;
  const decided = citations.filter((c) => c.verdict !== 'needs_judgment').length;
  // Text after the last citation that still holds a sentence is uncited.
  const tail = answer.slice(answer.lastIndexOf(']') + 1);
  const notes: string[] = [];
  if (all.length > pairs.length) notes.push(`Only the first ${LIMITS.citations} of ${all.length} citations were checked.`);
  const deferred = citations.filter((c) => c.verdict === 'needs_judgment').length;
  if (opts.includeJudgePrompts !== false && deferred > prompts)
    notes.push(`Judge prompts are returned for the first ${LIMITS.judgePrompts} needs_judgment items; send the rest in a second call.`);
  return {
    citations,
    summary: {
      citations: citations.length,
      decided,
      needs_judgment: citations.length - decided,
      by_verdict: by,
      uncited_text: citations.length === 0 ? /\w/.test(answer) : /\w{3,}/.test(tail),
      ...(notes.length ? { notes } : {}),
    },
    method: METHOD,
  };
}

// Apply a judge reply (from MCP sampling or any model) to a deferred result.
export function applyJudgeReply(r: CitationResult, reply: string, judge: string): CitationResult {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return { ...r, reason: `${r.reason} Judge reply was not JSON; left as needs_judgment.` };
  try {
    const v = JSON.parse(m[0]) as { supported?: unknown; failure_label?: unknown; reason?: unknown };
    const labels = ['right_doc_wrong_passage', 'wrong_document', 'unsupported_claim'];
    if (v.supported === true) {
      return { ...r, verdict: 'supported', supported: true, rule: `judge:${judge}`, reason: String(v.reason ?? ''), judge_prompt: undefined };
    }
    if (v.supported === false && labels.includes(String(v.failure_label))) {
      return { ...r, verdict: v.failure_label as Label, supported: false, rule: `judge:${judge}`, reason: String(v.reason ?? ''), judge_prompt: undefined };
    }
  } catch {
    /* fall through */
  }
  return { ...r, reason: `${r.reason} Judge reply did not match the schema; left as needs_judgment.` };
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
