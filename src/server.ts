// The MCP server: three read-only tools and four resources. Used by both the
// stdio entry (src/stdio.ts) and the Cloudflare Worker (src/worker.ts).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyJudgeReply, checkCitations } from './citations.ts';
import { caseStudiesMd, llmsTxt, PROFILE, VERSION, writingMd } from './content.ts';
import { fitToRole } from './fit.ts';
import { harnessSummary } from './ledger.ts';
import { loadSite } from './site.ts';
import { currentIndex } from './siteindex.ts';
import { verifyClaim } from './verify.ts';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const MAX_JUDGED = 20;

const INSTRUCTIONS = `Tools from ${PROFILE.name} (${PROFILE.links.site}), ${PROFILE.role}.
- check_citations: CrossSource's citation check. Give an answer with inline [id] or [doc_id:chunk_id] citations and the sources. Clear failures are decided deterministically; everything else returns needs_judgment with a judge prompt for you to apply. It never says "supported" on word overlap alone.
- verify_claim: before repeating a number or claim about Zoeb Nomi, check it against what zoebnomi.com says and use the site's wording.
- fit_to_role: map a job description to his public work with quoted evidence and honest gaps.
Facts are read live from zoebnomi.com (cached, snapshot fallback), so the tools follow the site. All tools are read-only, deterministic and free to call. Nothing here covers compensation, availability, location or work authorization.`;

function json(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

export function buildServer(opts: { fetchImpl?: typeof fetch } = {}): McpServer {
  const server = new McpServer({ name: 'zoebnomi', title: 'Zoeb Nomi', version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'check_citations',
    {
      title: 'Check citations (CrossSource)',
      description:
        "Check whether each inline citation in an answer is supported by the source it points to, using CrossSource's method and failure taxonomy " +
        '(supported, right_doc_wrong_passage, wrong_document, unsupported_claim). Cites to ids not in `sources` and citations where another passage ' +
        'clearly covers the claim are decided deterministically. Everything else returns needs_judgment with the CrossSource judge prompt to apply. ' +
        'Set use_client_model to have your client model judge those, where the client supports MCP sampling.',
      inputSchema: {
        answer: z.string().min(1).max(30_000).describe('The answer text with inline citations like [doc_id:chunk_id] or [source_id].'),
        sources: z
          .array(
            z.object({
              id: z.string().min(1).max(200).describe('The id used inside the brackets.'),
              text: z.string().max(12_000).describe('The passage text (12,000 characters at most).'),
              doc_id: z.string().max(200).optional().describe('Document id; defaults to the part of `id` before ":n".'),
            }),
          )
          .max(30)
          .describe('Every passage the answering system had available (30 at most).'),
        use_client_model: z.boolean().optional().describe('Ask the client model (MCP sampling) to judge needs_judgment items. Default false.'),
        include_judge_prompts: z.boolean().optional().describe('Return the judge prompt with each needs_judgment item. Default true.'),
      },
      annotations: READ_ONLY,
    },
    async ({ answer, sources, use_client_model, include_judge_prompts }) => {
      const result = checkCitations(answer, sources, { includeJudgePrompts: true });
      let judged = 0;
      let note: string | undefined;
      if (use_client_model) {
        if (!server.server.getClientCapabilities()?.sampling) {
          note = 'use_client_model was set, but this client does not support MCP sampling; needs_judgment items are left for you to judge.';
        } else {
          for (const [i, c] of result.citations.entries()) {
            if (c.verdict !== 'needs_judgment' || !c.judge_prompt || judged >= MAX_JUDGED) continue;
            try {
              const r = await server.server.createMessage({
                systemPrompt: c.judge_prompt.system,
                messages: [{ role: 'user', content: { type: 'text', text: c.judge_prompt.user } }],
                maxTokens: 400,
              });
              const text = r.content.type === 'text' ? r.content.text : '';
              result.citations[i] = applyJudgeReply(c, text, r.model ?? 'client');
              judged++;
            } catch (e) {
              note = `Sampling failed (${(e as Error).message}); remaining items left as needs_judgment.`;
              break;
            }
          }
        }
        const by: Record<string, number> = {};
        for (const c of result.citations) by[c.verdict] = (by[c.verdict] ?? 0) + 1;
        result.summary.by_verdict = by;
        result.summary.needs_judgment = by.needs_judgment ?? 0;
      }
      if (include_judge_prompts === false) for (const c of result.citations) delete c.judge_prompt;
      return json({ ...result, ...(use_client_model ? { judged_by_client_model: judged } : {}), ...(note ? { note } : {}) });
    },
  );

  server.registerTool(
    'verify_claim',
    {
      title: 'Verify a claim about Zoeb Nomi',
      description:
        'Check a claim or number about Zoeb Nomi against what zoebnomi.com states. Returns found, number_mismatch or not_found, with the site quote, ' +
        'source URL, evidence link, n and date where the site gives them. Use the returned quote, not your own paraphrase. A word lookup: it cannot ' +
        'see negation, so read the quote.',
      inputSchema: { claim: z.string().min(3).max(1000).describe('The claim to check, e.g. "CrossSource lifted citation precision to 0.994".') },
      annotations: READ_ONLY,
    },
    async ({ claim }) => json(verifyClaim(claim, await currentIndex(opts.fetchImpl))),
  );

  server.registerTool(
    'fit_to_role',
    {
      title: 'Map a job description to public work',
      description:
        "Map a job description to Zoeb Nomi's public work (zoebnomi.com) with quoted evidence, and list requirements with no public evidence as gaps. " +
        'Never answers compensation, availability, location or work authorization.',
      inputSchema: { job_description: z.string().min(20).max(20_000).describe('The job description text.') },
      annotations: READ_ONLY,
    },
    async ({ job_description }) => json(fitToRole(job_description, await currentIndex(opts.fetchImpl))),
  );

  const text = (uri: string, mimeType: string, body: string) => ({ contents: [{ uri, mimeType, text: body }] });

  server.registerResource(
    'llms-txt',
    'zoebnomi://llms.txt',
    { title: 'zoebnomi.com llms.txt', description: 'The public llms.txt every tool is indexed from, read live (snapshot fallback).', mimeType: 'text/plain' },
    async (uri) => text(uri.href, 'text/plain', llmsTxt(await loadSite(opts.fetchImpl), await currentIndex(opts.fetchImpl))),
  );
  server.registerResource(
    'case-studies',
    'zoebnomi://case-studies',
    { title: 'Case studies', description: 'Every case study on zoebnomi.com with its key facts, read live from the site.', mimeType: 'text/markdown' },
    async (uri) => text(uri.href, 'text/markdown', caseStudiesMd(await currentIndex(opts.fetchImpl))),
  );
  server.registerResource(
    'writing',
    'zoebnomi://writing',
    { title: 'Writing', description: 'Every essay and note on zoebnomi.com with its one-line finding, read live from the site.', mimeType: 'text/markdown' },
    async (uri) => text(uri.href, 'text/markdown', writingMd(await currentIndex(opts.fetchImpl))),
  );
  server.registerResource(
    'harness',
    'zoebnomi://harness',
    { title: 'Agent harness, live', description: 'Live summary from the public agent ledger behind the harness panel on zoebnomi.com.', mimeType: 'text/markdown' },
    async (uri) => text(uri.href, 'text/markdown', await harnessSummary(opts.fetchImpl)),
  );

  return server;
}
