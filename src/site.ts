// The portfolio is the source. Every tool reads zoebnomi.com live (llms.txt
// plus the case-study pages), cached for a few minutes, and falls back page by
// page to the snapshot bundled at build time when the site does not answer.
// Same idea as the résumé flow in apply-kit: nothing has to be kept in sync by
// hand, so a new build, essay or note on the site shows up in the tools
// without a release.

import { SNAPSHOT, SNAPSHOT_DATE } from './data/snapshot.ts';

export const SITE = 'https://www.zoebnomi.com';
export const PAGES: Record<string, string> = {
  'llms.txt': '/llms.txt',
  crosssource: '/crosssource/',
  'mirror-eval': '/mirror-eval/',
  'screener-eval': '/screener-eval/',
};

export interface Page {
  url: string;
  text: string;
  origin: 'live' | 'snapshot';
}

export interface Site {
  pages: Record<string, Page>;
  fetched_at: string;
  snapshot_date: string;
}

// House style: en dashes, em dashes and minus signs become "-".
export const fold = (s: string): string => s.replace(/[\u2013\u2014\u2212]/g, '-');

// House rules: no contact, booking, phone or location details in anything
// returned. They stay on the live site; the tools drop them. A line is dropped
// whole if it carries any of these; a "Based in ..." clause is cut out.
const PERSONAL_LINE = [
  /^\s*-?\s*(Contact|Phone|Mobile|Tel|WhatsApp|Location|Address|Email)\s*:/i,
  /@[a-z0-9-]+\.[a-z]{2,}/i,
  /\b(mailto|tel|sms):/i,
  /calendar\.app\.google|calendly\.com|cal\.com\//i,
  /\bwa\.me\/|whatsapp\.com\//i,
  // phone numbers: +country code, Indian 5+5 mobile, US (xxx) xxx-xxxx
  /\+\d{1,3}[\s.-]?\d[\d\s.-]{7,}\d|\b\d{5}[\s-]\d{5}\b|\(\d{3}\)\s?\d{3}-\d{4}/,
];
export const redact = (s: string): string =>
  s
    .split('\n')
    .filter((l) => !PERSONAL_LINE.some((re) => re.test(l)))
    .join('\n')
    .replace(/\s*Based in [^.\n]+(\.|$)/gm, '');

const decode = (s: string): string =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

export function htmlToText(html: string): string {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  return decode(
    main
      .replace(/<(script|style|svg|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|tr|div|section|figcaption|dd|dt)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function clean(key: string, body: string): string {
  return redact(fold(key === 'llms.txt' ? body : htmlToText(body)));
}

export function snapshotSite(): Site {
  const pages: Record<string, Page> = {};
  for (const [k, v] of Object.entries(SNAPSHOT)) pages[k] = { url: v.url, text: v.text, origin: 'snapshot' };
  return { pages, fetched_at: `snapshot ${SNAPSHOT_DATE}`, snapshot_date: SNAPSHOT_DATE };
}

export const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;
let cached: { site: Site; at: number } | null = null;
let inflight: Promise<Site> | null = null;

export function clearSiteCache(): void {
  cached = null;
  inflight = null;
}

// One fetch per page at most every CACHE_TTL_MS per process (or Worker isolate),
// so a busy day costs a handful of small GETs and no model calls.
export async function loadSite(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Site> {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.site;
  // Concurrent cold requests share one fetch of the site.
  if (!inflight) inflight = fetchSite(fetchImpl, now).finally(() => (inflight = null));
  return inflight;
}

async function fetchSite(fetchImpl: typeof fetch, now: number): Promise<Site> {
  const snap = snapshotSite();
  const entries = await Promise.all(
    Object.entries(PAGES).map(async ([key, path]): Promise<[string, Page]> => {
      const url = SITE + path;
      try {
        const res = await fetchImpl(url, {
          headers: { 'user-agent': 'zoebnomi-mcp' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          // Cloudflare edge cache hint; ignored outside Workers.
          ...({ cf: { cacheTtl: 900, cacheEverything: true } } as object),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        // Trust a live page only if it looks like the page (not an error or challenge page).
        if (key === 'llms.txt' ? !/^# /.test(body) || !body.includes('\n## ') : !/<main[\s>]/i.test(body)) throw new Error('unexpected page');
        const text = clean(key, body);
        if (text.length < 1000) throw new Error('page too short');
        return [key, { url, text, origin: 'live' }];
      } catch (e) {
        console.warn(JSON.stringify({ event: 'site_fallback', page: key, message: (e as Error)?.message }));
        return [key, snap.pages[key]];
      }
    }),
  );
  const site: Site = { pages: Object.fromEntries(entries), fetched_at: new Date(now).toISOString(), snapshot_date: SNAPSHOT_DATE };
  cached = { site, at: now };
  return site;
}
