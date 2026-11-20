// The claim index behind verify_claim and fit_to_role.
//
// Rules (enforced by test/claims.test.ts):
// - every `quote` is an exact substring of the snapshot named in `source`
//   (src/data/snapshot.ts, public text of zoebnomi.com);
// - every `n` appears as a number in the quote, every `date` in the source text;
// - no availability, visa, compensation, location or personal-life facts.
// `claim` is a plain restatement used for matching and display; the quote is
// what the site says and is what callers should repeat.

export interface Claim {
  id: string;
  topic: string;
  claim: string;
  quote: string;
  source: 'llms.txt' | 'crosssource' | 'mirror-eval' | 'screener-eval';
  evidence: string;
  n?: string;
  date?: string;
}

const SITE = 'https://www.zoebnomi.com';
const RECORD = `${SITE}/about/#record`;
const CS_REPO = 'https://github.com/zoeb-nomi/crosssource';
const CS = `${SITE}/crosssource/`;
const ME = `${SITE}/mirror-eval/`;
const SE = `${SITE}/screener-eval/`;

export const CLAIMS: Claim[] = [
  // Instead (current role)
  {
    id: 'instead-irs',
    topic: 'Instead',
    claim: 'Instead, where he works, was the first new entrant to clear IRS e-filing approval alongside incumbents.',
    quote: 'the first new entrant to clear IRS e-filing approval alongside incumbents',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-runtime',
    topic: 'Instead',
    claim: 'At Instead he tested a multi-step tax workflow end to end and cut its run time from 10 to 15 minutes to under a minute.',
    quote: 'At Instead he tested whether a multi-step tax workflow stays coherent end to end and cut its run time from 10 to 15 minutes to under a minute.',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-latency',
    topic: 'Instead',
    claim: 'Workflow latency cut about 90% by re-running only changed inputs, with an end-to-end coherence eval.',
    quote: 'Multi-step tax workflow: an end-to-end coherence eval across its steps, and latency cut ~90% by re-running only changed inputs.',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-citation-accuracy',
    topic: 'Instead',
    claim: 'Output quality at Instead: four-dimension rubric, weekly failure-mode review, about 95% citation accuracy on the production golden set.',
    quote:
      'Output quality: a four-dimension rubric and a weekly failure-mode review; ~95% citation accuracy on the production golden set; document ID and sub-type attached to every cited source.',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-citation-gap',
    topic: 'Instead',
    claim: 'At Instead he fixed the knowledge-citation gap failure mode (plausible but wrong citations).',
    quote: 'fixed the "knowledge-citation gap" failure mode (plausible-but-wrong citations)',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-ingestion',
    topic: 'Instead',
    claim: 'Specified a self-maintaining ingestion pipeline for 270K+ records of primary law; fetchability harness across 378 sources; remediation of about 139K documents.',
    quote:
      'specified a self-maintaining ingestion pipeline (270K+ records of primary law); fetchability harness across 378 sources; remediation of ~139K documents',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-lsm',
    topic: 'Instead',
    claim: 'Built a Legal Support Matrix across 160+ tax strategies and shipped Source Explorer.',
    quote: 'Legal Support Matrix across 160+ tax strategies; shipped Source Explorer',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'instead-onboarding',
    topic: 'Instead',
    claim: 'Individual-filer onboarding cut from 30+ clicks to 8; retention 27% to 53%; paid conversion 18% to 37%.',
    quote: 'individual-filer onboarding from 30+ clicks to 8 (retention 27% → 53%, paid conversion 18% → 37%)',
    source: 'llms.txt',
    evidence: RECORD,
  },
  // Earlier roles
  {
    id: 'keka-bgv',
    topic: 'Keka',
    claim: "Built Keka's Background Verification module zero to one on the Checkr API: 28 US enterprise clients, $2.7M MRR.",
    quote: "he built Keka's Background Verification module zero to one on the Checkr API: 28 US enterprise clients, $2.7M MRR",
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'keka-sso',
    topic: 'Keka',
    claim: 'At Keka: 6 SSO integrations, 27% adoption lift, $121K upsell.',
    quote: '6 SSO integrations, 27% adoption lift, $121K upsell',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'keka-exit',
    topic: 'Keka',
    claim: 'Keka Exit Module revamp: offboarding time down 28%, CSAT up 80%.',
    quote: 'Exit Module revamp, offboarding time -28%, CSAT +80%',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'multiplier',
    topic: 'Multiplier',
    claim: 'At Multiplier, the Value-Added Services vertical: $100K incremental revenue, 47% efficiency gain, partnership launched in 21 days.',
    quote: 'Multiplier (Value-Added Services vertical: $100K incremental revenue, 47% efficiency gain, partnership launched in 21 days)',
    source: 'llms.txt',
    evidence: RECORD,
  },
  {
    id: 'hurix',
    topic: 'Hurix Digital',
    claim: 'At Hurix Digital: agile transformation, 43% faster delivery; 31% conversion growth.',
    quote: 'Hurix Digital (agile transformation, 43% faster delivery; 31% conversion growth)',
    source: 'llms.txt',
    evidence: RECORD,
  },
  // CrossSource
  {
    id: 'cs-v03-dataset',
    topic: 'CrossSource',
    claim: 'CrossSource v0.3: 150 items (75 qa_citation, 75 citation_check) over 45 public US opinions from CourtListener, 15 legal topics.',
    quote:
      '150 items (75 qa_citation, 75 citation_check) over 45 public US opinions from CourtListener (27 federal circuit, 18 state supreme court, 2018 or later), 15 legal topics',
    source: 'llms.txt',
    evidence: CS_REPO,
    n: '150',
    date: '20 Oct 2026',
  },
  {
    id: 'cs-v03-kappa',
    topic: 'CrossSource',
    claim: "CrossSource v0.3 labels: two blind model raters, Cohen's kappa 0.98 on citation_check and 0.84 on qa_citation.",
    quote: "two blind, independent model raters, Cohen's kappa 0.98 on citation_check and 0.84 on qa_citation",
    source: 'llms.txt',
    evidence: `${CS_REPO}/blob/main/AGREEMENT.md`,
    n: '150',
  },
  {
    id: 'cs-v03-adjudication',
    topic: 'CrossSource',
    claim: 'CrossSource v0.3 adjudication: 30 items adjudicated by the maintainer with a third model rater; 27 of 30 matched the recommended label.',
    quote: '30 items in all) adjudicated by the maintainer with a third independent model rater, 27 of 30 matched the recommended label',
    source: 'llms.txt',
    evidence: `${CS_REPO}/blob/main/ADJUDICATION.md`,
    n: '30',
  },
  {
    id: 'cs-v03-sanity',
    topic: 'CrossSource',
    claim: 'CrossSource v0.3 sanity run on a 30-item sample: claude-sonnet-5-5 precision 0.919, recall 0.718, citation_check 1.00; gpt-5-mini 0.763, 0.718, 0.93.',
    quote:
      'Sanity run on a 30-item sample, not a full run: claude-sonnet-5-5 citation precision 0.919 / recall 0.718, citation_check accuracy 1.00; gpt-5-mini 0.763 / 0.718, 0.93',
    source: 'llms.txt',
    evidence: CS,
    n: '30',
  },
  {
    id: 'cs-v01-precision',
    topic: 'CrossSource',
    claim: 'CrossSource v0.1: citation-discipline prompting lifted citation precision from 0.981 to 0.994.',
    quote: 'citation-discipline prompting lifted citation precision 0.981 (baseline) → 0.994 (strict)',
    source: 'llms.txt',
    evidence: CS,
    n: '25',
  },
  {
    id: 'cs-v01-recall',
    topic: 'CrossSource',
    claim: 'CrossSource v0.1: recall 0.760 in both configurations, capped by retrieval.',
    quote: 'recall stayed at 0.760 because retrieval, not the model, was the limit',
    source: 'crosssource',
    evidence: CS,
    n: '25',
  },
  {
    id: 'cs-v01-judge',
    topic: 'CrossSource',
    claim: 'CrossSource v0.1: 100% (15/15) blind human-judge agreement on a stratified sample of judge verdicts.',
    quote: '100% (15/15) blind human-judge agreement',
    source: 'llms.txt',
    evidence: `${SITE}/writing/the-judge-caught-a-bug/`,
    n: '15',
  },
  {
    id: 'cs-v01-bug',
    topic: 'CrossSource',
    claim: 'The blind check caught a harness bug: consecutive citations produced punctuation-only claim spans the judge scored as failures.',
    quote: 'consecutive citations produced punctuation-only claim spans that the judge initially mislabeled as failures',
    source: 'crosssource',
    evidence: `${SITE}/writing/the-judge-caught-a-bug/`,
  },
  {
    id: 'cs-v01-corpus',
    topic: 'CrossSource',
    claim: 'CrossSource v0.1: 22 public-domain US court opinions, 25-question golden set, BM25 top-5 retrieval.',
    quote: 'Corpus: 22 public-domain US court opinions; 25-question golden set; BM25 top-5 retrieval.',
    source: 'llms.txt',
    evidence: CS_REPO,
    n: '25',
  },
  // Other evals
  {
    id: 'cheap-tier',
    topic: 'cheap-tier-legal-tax-hr',
    claim: 'Model routing study: 5 models on 1,414 expert-labelled yes/no items across tax, legal and HR.',
    quote: '5 models on 1,414 expert-labelled yes/no items',
    source: 'llms.txt',
    evidence: 'https://github.com/zoeb-nomi/cheap-tier-legal-tax-hr',
    n: '1414',
  },
  {
    id: 'note-0-9-threshold',
    topic: 'Decisions API',
    claim: 'At 0.9 stated confidence, 47 of 377 answers were wrong; no threshold hit 95%.',
    quote: 'At 0.9 confidence, 47 of 377 were wrong." (47 of 377 wrong. No threshold hit 95%.)',
    source: 'llms.txt',
    evidence: `${SITE}/notes/the-0-9-threshold/`,
    n: '377',
  },
  {
    id: 'note-confident-no',
    topic: 'Decisions API',
    claim: '242 answers at 0.1 or less confidence; the lawyers said yes to 41.',
    quote: '242 answers at 0.1 or less. The lawyers said yes to 41.',
    source: 'llms.txt',
    evidence: `${SITE}/notes/confident-no/`,
    n: '242',
  },
  {
    id: 'mirror-waves',
    topic: 'mirror-eval',
    claim: 'mirror-eval: two waves, 332 probes each, across ChatGPT, Claude, Perplexity and Gemini.',
    quote: 'Two waves (2026-08-06, 2026-09-04), 332 probes each across ChatGPT, Claude, Perplexity, Gemini.',
    source: 'llms.txt',
    evidence: ME,
    n: '332',
    date: '2026-09-04',
  },
  {
    id: 'mirror-perplexity',
    topic: 'mirror-eval',
    claim: 'mirror-eval: Perplexity cited zoebnomi.com on 13 then 63 of 63 search probes; Claude on 0 then 0 of 63.',
    quote: 'Perplexity 13-of-63 → 63-of-63 search probes citing zoebnomi.com; Claude 0-of-63 → 0-of-63',
    source: 'llms.txt',
    evidence: ME,
    n: '63',
  },
  {
    id: 'mirror-repo-cited',
    topic: 'mirror-eval',
    claim: 'mirror-eval: the CrossSource repo was cited by ChatGPT 0 then 25 of 63, Gemini 0 then 32 of 63.',
    quote: 'CrossSource repo cited by ChatGPT 0 → 25-of-63 and Gemini 0 → 32-of-63',
    source: 'llms.txt',
    evidence: ME,
    n: '63',
  },
  {
    id: 'mirror-judge',
    topic: 'mirror-eval',
    claim: 'mirror-eval: blind human validation of the LLM judges matched 3 of 40 and 12 of 40, so the taxonomy is reported as bands only.',
    quote: 'Blind human validation of the LLM judges: 3/40 and 12/40, so the taxonomy is reported as bands only.',
    source: 'llms.txt',
    evidence: ME,
    n: '40',
  },
  {
    id: 'screener-design',
    topic: 'screener-eval',
    claim: 'screener-eval: one résumé, 21 open US AI PM postings, two cheap-tier screeners, 5 reps, 885 calls.',
    quote: 'One résumé, 21 open US AI PM postings, two cheap-tier screeners, 5 reps, 885 calls.',
    source: 'llms.txt',
    evidence: SE,
    n: '885',
  },
  {
    id: 'screener-employer',
    topic: 'screener-eval',
    claim: 'screener-eval: swapping employer names moved the score +0.07 / -1.14 points; 95% CIs straddle zero.',
    quote: 'Employer-name swap: +0.07 / -1.14 points (95% CIs straddle zero).',
    source: 'llms.txt',
    evidence: SE,
    n: '885',
  },
  {
    id: 'screener-links',
    topic: 'screener-eval',
    claim: 'screener-eval: deleting every link moved the score -0.90 on one screener and +0.41 on the other.',
    quote: 'Link deletion: -0.90 / +0.41.',
    source: 'llms.txt',
    evidence: SE,
  },
  {
    id: 'screener-gap',
    topic: 'screener-eval',
    claim: 'screener-eval: cross-screener gap on the same input 22.3 points mean; verdicts agree on 6 of 21 postings.',
    quote: 'Cross-screener gap on the same input: 22.3 points mean, verdicts agree on 6 of 21 postings.',
    source: 'llms.txt',
    evidence: SE,
    n: '21',
  },
  {
    id: 'screener-parser',
    topic: 'screener-eval',
    claim: 'screener-eval parser test: plain extractors 26/29, then 29/29 after printing URLs as text.',
    quote: 'Parser test: plain extractors 26/29 → 29/29 after printing URLs as text.',
    source: 'llms.txt',
    evidence: SE,
    n: '29',
  },
  // Open source
  {
    id: 'taxcalcbench',
    topic: 'open source',
    claim: 'TaxCalcBench PR #157 (open, not merged): audit of all 101 test cases, 2 answer-key errors and 5 input conflicts found.',
    quote:
      'Open-source contributions (open pull requests, not merged): TaxCalcBench (Column Tax) PR #157: audit of all 101 test cases against official instructions, 2 answer-key errors and 5 input conflicts found',
    source: 'llms.txt',
    evidence: 'https://github.com/column-tax/tax-calc-bench/pull/157',
    n: '101',
  },
  {
    id: 'eyecite',
    topic: 'open source',
    claim: 'eyecite PR #360 (open, not merged): Id. resolution fix, extraction benchmark 0 gains / 0 losses on 15,988 citations.',
    quote: 'extraction benchmark 0 gains / 0 losses on 15,988 citations',
    source: 'llms.txt',
    evidence: 'https://github.com/freelawproject/eyecite/pull/360',
    n: '15988',
  },
  // Systems
  {
    id: 'tradeframe',
    topic: 'TradeFrame',
    claim: 'TradeFrame is guarded automation: the AI proposes only, a deterministic layer validates against hard rails, a person or validated code executes.',
    quote:
      'a personal trading system where the AI proposes only, a deterministic layer validates against hard rails, and a person (US book) or validated code (India book) executes. Each book has its own kill switch; every decision is scored against a do-nothing baseline.',
    source: 'llms.txt',
    evidence: 'https://github.com/zoeb-nomi/tradeframe',
  },
  {
    id: 'note-silent-failures',
    topic: 'harness',
    claim: '9 silent failures behind 438 green runs: one run took 59 ms and the log said success.',
    quote: 'One run took 59 ms. The log said success." (9 silent failures behind 438 green runs.)',
    source: 'llms.txt',
    evidence: `${SITE}/notes/silence-is-information/`,
    n: '438',
  },
  {
    id: 'note-74-strings',
    topic: 'harness',
    claim: 'His site fails CI unless it still says 74 required strings; 11 are banned.',
    quote: 'My site fails CI unless it still says 74 things." (74 required. 11 banned. Exit 1 otherwise.)',
    source: 'llms.txt',
    evidence: `${SITE}/notes/seventy-four-strings/`,
    n: '74',
  },
  {
    id: 'note-444-239',
    topic: 'recruiter-prompt-bank',
    claim: 'recruiter-prompt-bank: 444 prompts collected, 239 kept, the 205 rejects public.',
    quote: '444 collected, 239 kept. The 205 rejects are public.',
    source: 'llms.txt',
    evidence: `${SITE}/notes/444-to-239/`,
    n: '239',
  },
];
