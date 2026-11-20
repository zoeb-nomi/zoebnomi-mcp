// fit_to_role: map a job description to Zoeb Nomi's public work, with cited
// evidence, and list the gaps honestly. Deterministic keyword mapping. Evidence
// is picked from the live site index (src/siteindex.ts) each call, so a new
// build or note on zoebnomi.com becomes evidence without a code change; every
// piece of evidence is a quote from the site. A requirement with no match is a gap, stated as "no public
// evidence", never bridged. Compensation, availability, visa, relocation,
// location and notice questions are out of scope by design.

import type { Entry, Index } from './siteindex.ts';
import { normalizeDashes } from './text.ts';

interface Capability {
  id: string;
  label: string;
  keywords: string[];
  evidence: string[]; // preferred curated claim ids, used first while they are still on the site
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'evals',
    label: 'Evals, benchmarks and golden datasets',
    keywords: ['eval', 'evals', 'evaluation', 'evaluations', 'benchmark', 'benchmarks', 'golden', 'dataset', 'datasets', 'ground truth', 'labeling', 'labelling', 'annotation', 'test set', 'quality metrics'],
    evidence: ['cs-v03-dataset', 'cs-v03-kappa', 'instead-citation-accuracy', 'screener-design', 'cheap-tier'],
  },
  {
    id: 'judges',
    label: 'LLM-as-judge and validating the judge',
    keywords: ['llm-as-a-judge', 'llm as a judge', 'judge', 'judges', 'human review', 'human evaluation', 'inter-rater', 'rubric', 'rubrics', 'calibration', 'red team', 'red-team', 'red teaming'],
    evidence: ['cs-v01-judge', 'cs-v01-bug', 'mirror-judge', 'cs-v03-adjudication'],
  },
  {
    id: 'rag',
    label: 'RAG, retrieval and citation accuracy',
    keywords: ['rag', 'retrieval', 'retrieval-augmented', 'citation', 'citations', 'grounding', 'grounded', 'hallucination', 'hallucinations', 'search', 'knowledge base', 'embeddings', 'vector'],
    evidence: ['instead-citation-accuracy', 'instead-citation-gap', 'cs-v01-precision', 'cs-v01-recall'],
  },
  {
    id: 'workflows',
    label: 'Multi-step AI workflows, agents and guardrails',
    keywords: ['agent', 'agents', 'agentic', 'workflow', 'workflows', 'orchestration', 'guardrail', 'guardrails', 'tool use', 'tool calling', 'automation', 'multi-step', 'llm application', 'llm applications', 'generative ai', 'genai', 'ai product', 'ai products', 'ai features'],
    evidence: ['instead-runtime', 'instead-latency', 'tradeframe'],
  },
  {
    id: 'reliability',
    label: 'Production reliability: latency, monitoring, silent failures',
    keywords: ['latency', 'performance', 'reliability', 'observability', 'monitoring', 'tracing', 'traces', 'production', 'incident', 'incidents', 'quality'],
    evidence: ['instead-latency', 'note-silent-failures', 'note-74-strings'],
  },
  {
    id: 'data',
    label: 'Data pipelines and content ingestion',
    keywords: ['ingestion', 'pipeline', 'pipelines', 'data quality', 'etl', 'data platform', 'corpus', 'documents', 'content operations'],
    evidence: ['instead-ingestion'],
  },
  {
    id: 'regulated',
    label: 'Regulated domains: tax, legal, HR, compliance',
    keywords: ['tax', 'legal', 'law', 'compliance', 'regulated', 'regulatory', 'fintech', 'financial services', 'hr', 'hrtech', 'hr tech', 'payroll', 'background check', 'background checks', 'risk'],
    evidence: ['instead-irs', 'instead-lsm', 'keka-bgv', 'cheap-tier'],
  },
  {
    id: 'zero-to-one',
    label: 'Zero-to-one B2B products, APIs and integrations',
    keywords: ['0 to 1', '0-1', '0→1', 'zero to one', 'zero-to-one', 'new product', 'b2b', 'saas', 'enterprise', 'api', 'apis', 'platform', 'integration', 'integrations', 'partner', 'partners', 'partnership', 'partnerships', 'marketplace'],
    evidence: ['keka-bgv', 'keka-sso', 'multiplier'],
  },
  {
    id: 'growth',
    label: 'Onboarding, activation, retention and conversion',
    keywords: ['onboarding', 'activation', 'retention', 'conversion', 'growth', 'funnel', 'experiment', 'experiments', 'experimentation', 'a/b', 'ab test', 'metrics', 'kpi', 'kpis', 'okrs'],
    evidence: ['instead-onboarding', 'keka-exit', 'hurix'],
  },
  {
    id: 'models',
    label: 'Model selection, routing, confidence and cost',
    keywords: ['model selection', 'routing', 'model routing', 'fine-tuning', 'fine tuning', 'llm', 'llms', 'large language model', 'large language models', 'foundation model', 'foundation models', 'confidence', 'cost', 'inference'],
    evidence: ['cheap-tier', 'note-0-9-threshold', 'note-confident-no'],
  },
  {
    id: 'open-source',
    label: 'Open source, public research and writing',
    keywords: ['open source', 'open-source', 'research', 'publish', 'publication', 'publications', 'developer', 'developers', 'community', 'technical writing', 'documentation'],
    evidence: ['taxcalcbench', 'eyecite', 'cs-v03-dataset'],
  },
  {
    id: 'ai-search',
    label: 'AI search visibility and how engines cite sources',
    keywords: ['ai search', 'answer engine', 'generative engine', 'geo', 'seo', 'search engines', 'perplexity', 'chatgpt'],
    evidence: ['mirror-perplexity', 'mirror-repo-cited'],
  },
];

// Lines that ask about these are answered by a person, not this tool.
const OUT_OF_SCOPE = [
  'salary', 'compensation', 'pay range', 'base pay', 'equity', 'bonus', 'benefits', 'visa', 'sponsorship', 'sponsor',
  'work authorization', 'authorized to work', 'relocate', 'relocation', 'notice period', 'start date', 'availability',
  'on-site', 'onsite', 'in-office', 'hybrid', 'remote', 'located in', 'based in', 'time zone', 'timezone', 'travel',
];

const REQ_HINT =
  /\b(experience|years|proficien|familiar|knowledge of|ability to|track record|expertise|background in|understanding of|you have|you've|you will|you'll|must|required|requirement|preferred|bonus points|nice to have|degree|bachelor|master|strong|deep|hands-on)\b/i;

export interface FitResult {
  summary: { requirements: number; with_evidence: number; gaps: number; out_of_scope: number; coverage: number };
  matches: Array<{
    capability: string;
    jd_lines: string[];
    evidence: Array<{ quote: string; source_url: string; evidence: string }>;
  }>;
  gaps: Array<{ jd_line: string; note: string }>;
  out_of_scope: string[];
  method: string;
  index: Index['meta'];
}

const KW_RE = new Map<string, RegExp>();
function hasKeyword(line: string, kw: string): boolean {
  let re = KW_RE.get(kw);
  if (!re) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    re = new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, 'i');
    KW_RE.set(kw, re);
  }
  return re.test(line);
}

const BULLET = /^\s*([-*•·]|\d+[.)])\s+/;

// Lines and sentences of a JD; bullet lines are marked, since a bullet under
// a JD heading is almost always a requirement or a duty.
export function splitRequirements(jd: string): Array<{ text: string; bullet: boolean }> {
  const out = new Map<string, boolean>();
  for (const raw of normalizeDashes(jd).split(/\r?\n/)) {
    const bullet = BULLET.test(raw);
    for (const part of raw.replace(BULLET, '').split(/(?<=[.;])\s+(?=[A-Z])/)) {
      const text = part.trim();
      if (text.length >= 12 && text.length <= 400 && !out.has(text)) out.set(text, bullet);
    }
  }
  return [...out].map(([text, bullet]) => ({ text, bullet }));
}

export function fitToRole(jobDescription: string, index: Index): FitResult {
  const lines = splitRequirements(jobDescription);
  const byCap = new Map<string, string[]>();
  const gaps: FitResult['gaps'] = [];
  const outOfScope: string[] = [];
  let requirements = 0;
  let withEvidence = 0;

  for (const { text: line, bullet } of lines) {
    if (OUT_OF_SCOPE.some((k) => hasKeyword(line, k))) {
      outOfScope.push(line);
      continue;
    }
    const caps = CAPABILITIES.filter((c) => c.keywords.some((k) => hasKeyword(line, k)));
    const isReq = bullet || REQ_HINT.test(line);
    if (!caps.length && !isReq) continue; // company blurb, not a requirement
    requirements++;
    if (caps.length) {
      withEvidence++;
      for (const c of caps) byCap.set(c.id, [...(byCap.get(c.id) ?? []), line]);
    } else {
      gaps.push({ jd_line: line, note: 'No public evidence on zoebnomi.com for this. Not claimed.' });
    }
  }

  const byId = new Map(index.entries.map((e) => [e.id, e]));
  const pick = (c: Capability): Entry[] => {
    const preferred = c.evidence.map((id) => byId.get(id)).filter((e): e is Entry => !!e);
    // Anything else on the site that names this capability, ranked by keyword hits.
    const found = index.entries
      .filter((e) => !preferred.includes(e))
      .map((e) => ({ e, hits: c.keywords.filter((k) => hasKeyword(`${e.topic} ${e.quote}`, k)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.e);
    // Two anchored claims, then the two best matches from anywhere on the site
    // (so new builds and notes surface), one quote per evidence link.
    const out: Entry[] = [];
    const urls = new Set<string>();
    const take = (list: Entry[], max: number) => {
      for (const e of list) {
        if (out.length >= max) break;
        if (out.includes(e) || urls.has(e.evidence)) continue;
        urls.add(e.evidence);
        out.push(e);
      }
    };
    take(preferred, 2);
    take(found, 4);
    take(preferred, 4);
    return out;
  };
  const matches = CAPABILITIES.filter((c) => byCap.has(c.id)).map((c) => ({
    capability: c.label,
    jd_lines: byCap.get(c.id)!,
    evidence: pick(c).map((e) => ({ quote: e.quote, source_url: e.source_url, evidence: e.evidence })),
  }));

  return {
    summary: {
      requirements,
      with_evidence: withEvidence,
      gaps: gaps.length,
      out_of_scope: outOfScope.length,
      coverage: requirements ? Math.round((withEvidence / requirements) * 100) / 100 : 0,
    },
    matches,
    gaps,
    out_of_scope: outOfScope.length
      ? [`Not answered by this tool (compensation, location, availability, work authorization): ${outOfScope.length} line(s). Ask Zoeb directly.`]
      : [],
    method:
      'Keyword map from JD lines to capability areas; evidence is quoted from zoebnomi.com. A keyword hit shows related public work, not that every requirement is met in full. Read the quotes.',
    index: index.meta,
  };
}
