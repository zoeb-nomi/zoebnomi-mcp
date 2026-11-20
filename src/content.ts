// Profile constants and the text of the resources. Resource text is built from
// the live site index; nothing here adds facts the site does not state.

import type { Index } from './siteindex.ts';
import type { Site } from './site.ts';
import { SITE } from './site.ts';

export const VERSION = '0.1.0';
export { SITE };

export const PROFILE = {
  name: 'Zoeb Nomi',
  role: 'AI Product Manager · Agents, workflows and evals',
  positioning: 'LLM products fail quietly. I ship the workflow and the checks that catch it.',
  links: {
    site: SITE,
    linkedin: 'https://www.linkedin.com/in/zoebnomi',
    github: 'https://github.com/zoeb-nomi',
    x: 'https://x.com/zoeb_nomi',
  },
};

// Resources are generated from the live site index, so they follow the site.

function originNote(ix: Index): string {
  return ix.meta.source === 'live'
    ? `Read live from ${SITE} at ${ix.meta.fetched_at}.`
    : `From the snapshot of ${SITE} taken ${ix.meta.snapshot_date} (${ix.meta.source === 'mixed' ? 'some pages did not answer live' : 'the site did not answer live'}).`;
}

export function llmsTxt(site: Site, ix: Index): string {
  const p = site.pages['llms.txt'];
  return `# ${p.url} (${originNote(ix)} Contact, booking and location lines removed.)\n\n${p.text}`;
}

export function caseStudiesMd(ix: Index): string {
  const cases = ix.listings.filter((l) => l.kind === 'case-study');
  const builds = ix.listings.find((l) => l.kind === 'page' && /^builds$/i.test(l.title));
  const parts = cases.map((c) => {
    const name = c.title.toLowerCase();
    const facts = ix.entries
      .filter((e) => !e.curated && (e.topic.toLowerCase().includes(name) || e.quote.toLowerCase().startsWith(name)))
      .slice(0, 4)
      .map((e) => `- ${e.quote}`);
    const repo = ix.entries.find((e) => e.evidence.includes(`github.com/zoeb-nomi/${name}`))?.evidence;
    return `## ${c.title}\n${c.url}${repo ? `\nRepo: ${repo}` : ''}\n\n${facts.join('\n')}`;
  });
  if (builds) parts.push(`## Builds\n${builds.url}\n\n${builds.summary}`);
  return `# Case studies\n\n${parts.join('\n\n')}\n\n${originNote(ix)}\n`;
}

export function writingMd(ix: Index): string {
  const line = (l: { title: string; url: string; summary: string }) => `- [${l.title}](${l.url}): ${l.summary}`;
  const essays = ix.listings.filter((l) => l.kind === 'writing').map(line);
  const notes = ix.listings.filter((l) => l.kind === 'note').map(line);
  return `# Writing\n\n## Essays\n${essays.join('\n')}\n\n## Notes (one counted finding each)\n${notes.join('\n')}\n\n${originNote(ix)}\n`;
}
