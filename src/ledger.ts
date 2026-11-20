// The live harness summary, read-only, from the public agent ledger that the
// zoebnomi.com harness panel reads. Only the figures the site panel shows are
// passed through; token and list-price figures are left out.

export const LEDGER_URL = 'https://agent-ledger.zoeb-nomi5699.workers.dev';

interface Summary {
  generated_at?: string;
  last_event_at?: string;
  live?: { day?: string; tz?: string; agent_runs_today?: number; subagent_runs_today?: number };
  outcomes?: {
    since?: string;
    shipped_7d?: number;
    caught_7d?: number;
    cost?: { all_in_per_shipped_usd?: number };
    readout?: {
      on_time?: { x?: number; y?: number; scope?: string };
      median_wait_for_review_min?: { value?: number; n?: number; scope?: string };
    };
  };
}

// One ledger read per minute per process or isolate, at most.
const LEDGER_TTL_MS = 60 * 1000;
let cachedSummary: { text: string; at: number } | null = null;
export function clearLedgerCache(): void {
  cachedSummary = null;
}

export async function harnessSummary(fetchImpl: typeof fetch = fetch, timeoutMs = 4000, now = Date.now()): Promise<string> {
  if (cachedSummary && now - cachedSummary.at < LEDGER_TTL_MS) return cachedSummary.text;
  const text = await readSummary(fetchImpl, timeoutMs);
  cachedSummary = { text, at: now };
  return text;
}

async function readSummary(fetchImpl: typeof fetch, timeoutMs: number): Promise<string> {
  try {
    const res = await fetchImpl(`${LEDGER_URL}/v1/summary`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = (await res.json()) as Summary;
    const o = s.outcomes ?? {};
    const r = o.readout ?? {};
    const lines = [
      '# Agent harness, live',
      `Source: ${LEDGER_URL}/v1/summary (public, read-only). The same numbers as the harness panel on https://www.zoebnomi.com/.`,
      `Generated: ${s.generated_at ?? 'unknown'}; last event: ${s.last_event_at ?? 'unknown'}.`,
      '',
      `Today (${s.live?.day ?? '?'}, ${s.live?.tz ?? '?'}): ${s.live?.agent_runs_today ?? '?'} agent runs, ${s.live?.subagent_runs_today ?? '?'} subagent runs.`,
      `Last 7 days: ${o.shipped_7d ?? '?'} closed (done, or PR opened), ${o.caught_7d ?? '?'} caught before merge. Counting since ${o.since ?? '?'}.`,
      `All-in cost per closed task: $${o.cost?.all_in_per_shipped_usd ?? '?'}.`,
    ];
    if (r.on_time) lines.push(`On time: ${r.on_time.x}/${r.on_time.y} (${r.on_time.scope ?? ''}).`);
    if (r.median_wait_for_review_min)
      lines.push(`Median wait for review: ${r.median_wait_for_review_min.value} min, n = ${r.median_wait_for_review_min.n} (${r.median_wait_for_review_min.scope ?? ''}).`);
    return lines.join('\n') + '\n';
  } catch (e) {
    console.warn(JSON.stringify({ event: 'ledger_unavailable', message: (e as Error)?.message }));
    return '# Agent harness, live\nThe ledger is not answering right now. See the panel on https://www.zoebnomi.com/ instead.\n';
  }
}
