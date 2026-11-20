#!/usr/bin/env node
// npx zoebnomi                         terminal card
// npx zoebnomi check-citations <file>  CrossSource citation check ({ "answer", "sources" } JSON; "-" reads stdin)
// npx zoebnomi verify "<claim>"        check a claim against zoebnomi.com
// npx zoebnomi fit <jd-file>           map a job description to public work
// npx zoebnomi mcp                     run the MCP server on stdio

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCitations, type Source } from './citations.ts';
import { PROFILE, VERSION } from './content.ts';
import { fitToRole } from './fit.ts';
import { currentIndex } from './siteindex.ts';
import { verifyClaim } from './verify.ts';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s: string) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s);

function card(): string {
  const rows = [
    bold(PROFILE.name),
    PROFILE.role,
    red('─'.repeat(44)),
    PROFILE.positioning,
    '',
    `${dim('site    ')} ${PROFILE.links.site}`,
    `${dim('linkedin')} ${PROFILE.links.linkedin}`,
    `${dim('github  ')} ${PROFILE.links.github}`,
    `${dim('x       ')} ${PROFILE.links.x}`,
    '',
    dim('npx zoebnomi check-citations answer.json   npx zoebnomi verify "<claim>"'),
    dim('npx zoebnomi fit jd.txt                    npx zoebnomi mcp'),
  ];
  return '\n' + rows.map((r) => '  ' + r).join('\n') + '\n';
}

function readInput(path: string): string {
  return readFileSync(path === '-' ? 0 : path, 'utf8');
}

const HELP = `zoebnomi ${VERSION}

Usage:
  zoebnomi                          print the card
  zoebnomi check-citations <file>   check citations; file is JSON {"answer": "...", "sources": [{"id","text"}]}, or - for stdin
      --json                        print the full JSON result
      --strict                      exit 1 if any citation is decided as a failure
  zoebnomi verify "<claim>"         check a claim against zoebnomi.com  (--json)
  zoebnomi fit <jd-file>            map a job description to public work  (--json)
  zoebnomi mcp                      run the MCP server on stdio
  zoebnomi --version | --help
`;

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const asJson = flags.has('--json');
  // The server's structured logs (site fallback, ledger) are for Workers Logs, not a person at a terminal.
  if (cmd !== 'mcp' && !flags.has('--verbose')) console.warn = () => {};

  switch (cmd) {
    case undefined:
    case 'card':
      process.stdout.write(card());
      return 0;
    case '--version':
    case '-v':
      console.log(VERSION);
      return 0;
    case '--help':
    case '-h':
    case 'help':
      process.stdout.write(HELP);
      return 0;
    case 'mcp': {
      const { runStdio } = await import('./stdio.ts');
      await runStdio();
      return -1; // keep running
    }
    case 'check-citations': {
      if (!args[0]) return usage('check-citations needs a file');
      const input = JSON.parse(readInput(args[0])) as { answer?: string; sources?: Source[] };
      if (typeof input.answer !== 'string' || !Array.isArray(input.sources)) return usage('file must be JSON {"answer": string, "sources": [{"id","text"}]}');
      const r = checkCitations(input.answer, input.sources, { includeJudgePrompts: asJson });
      if (asJson) console.log(JSON.stringify(r, null, 2));
      else {
        for (const c of r.citations) {
          const mark = c.verdict === 'needs_judgment' ? dim('?') : c.supported ? '✓' : red('✗');
          console.log(`${mark} [${c.citation}] ${c.verdict}\n    ${dim(c.claim.slice(0, 160))}\n    ${c.reason}`);
        }
        const s = r.summary;
        console.log(`\n${s.citations} citations: ${s.decided} decided, ${s.needs_judgment} need a judgment (run with --json for judge prompts).`);
        if (s.uncited_text) console.log(red('Text after the last citation is uncited.'));
      }
      const failed = r.citations.some((c) => c.supported === false);
      return flags.has('--strict') && failed ? 1 : 0;
    }
    case 'verify': {
      if (!args.length) return usage('verify needs a claim');
      const r = verifyClaim(args.join(' '), await currentIndex());
      if (asJson) console.log(JSON.stringify(r, null, 2));
      else {
        console.log(`${r.status === 'found' ? '✓' : red('✗')} ${r.status}: ${r.message}`);
        if (r.match) console.log(`  ${dim('source')}   ${r.match.source_url}\n  ${dim('evidence')} ${r.match.evidence}${r.match.n ? `\n  ${dim('n')}        ${r.match.n}` : ''}${r.match.date ? `\n  ${dim('date')}     ${r.match.date}` : ''}`);
      }
      return 0;
    }
    case 'fit': {
      if (!args[0]) return usage('fit needs a job description file');
      const r = fitToRole(readInput(args[0]), await currentIndex());
      if (asJson) console.log(JSON.stringify(r, null, 2));
      else {
        const s = r.summary;
        console.log(bold(`${s.headline}\n`));
        for (const m of r.matches) console.log(`✓ ${m.capability}\n    ${m.evidence.map((e) => e.evidence).filter((v, i, a) => a.indexOf(v) === i).join('\n    ')}`);
        if (r.gaps.length) console.log(red(`\nGaps (no public evidence):`));
        for (const g of r.gaps) console.log(`  - ${g.jd_line}`);
        for (const o of r.out_of_scope) console.log(dim(`\n${o}`));
      }
      return 0;
    }
    default:
      return usage(`unknown command: ${cmd}`);
  }
}

function usage(msg: string): number {
  console.error(`${msg}\n\n${HELP}`);
  return 2;
}

if (isMain()) {
  main(process.argv.slice(2)).then(
    (code) => {
      if (code >= 0) process.exitCode = code;
    },
    (e) => {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
    },
  );
}

function isMain(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
