// Small, deterministic text helpers shared by every tool. No model calls.

// House style: no en or em dashes in anything this server returns. The minus
// sign is folded too, so numbers like "−1.14" compare as "-1.14".
export function normalizeDashes(s: string): string {
  return s.replace(/[\u2013\u2014\u2212]/g, '-');
}

// Same tokenizer as CrossSource (src/retrieval.py): lowercase [a-z0-9]+ runs.
export function tokens(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

const STOP = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her his i if in into is it its ' +
    'may might must not of on or our she should so such than that the their them then there these they this those to ' +
    'was we were what when where which while who whom why will with would you your also any each other only own same ' +
    'very about after again all am because before being below between both during few further here how more most no ' +
    'nor off once out over under until up s t just now id'
  ).split(' '),
);

// Light, predictable stemming: enough to match "citations" with "citation" and
// "courts" with "court". Not a real stemmer, on purpose.
export function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

export function contentTokens(s: string): string[] {
  return tokens(s)
    .filter((t) => !STOP.has(t))
    .map(stem);
}

// Numbers as written, normalised: "1,414" -> "1414", "0.990" -> "0.99", "27%" -> "27",
// "$2.7M" -> "2700000", "100K" -> "100000" (so "100+" never matches "$100K").
// Signs and currency are ignored; "10-15" yields 10 and 15.
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
export function numbers(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?([kKmMbB](?![a-zA-Z]))?/g)) {
    const raw = m[0].replace(/[kKmMbB]$/, '').replace(/,(?=\d{3}\b)/g, '').replace(/,$/, '');
    const n = Number(raw) * (m[1] ? SCALE[m[1].toLowerCase()] : 1);
    if (Number.isFinite(n)) out.push(String(Math.round(n * 1e6) / 1e6));
  }
  return out;
}

export function unique<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}
