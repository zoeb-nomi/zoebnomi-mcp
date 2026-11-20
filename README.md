# zoebnomi

Tools, not an "about me" bot. An MCP server, a CLI and a Claude Skill from [Zoeb Nomi](https://www.zoebnomi.com). The lead tool is the citation check from [CrossSource](https://github.com/zoeb-nomi/crosssource), his open eval harness for citation accuracy in legal RAG, packaged so any agent can call it.

Every tool is read-only and deterministic, and costs nothing to call. No API keys and no model calls on the server.

**The portfolio is the source.** Like the résumé flow, the tools read zoebnomi.com live (llms.txt and the case-study pages), cached for 15 minutes. A new build, essay or note on the site shows up in `verify_claim`, `fit_to_role` and the resources with no release. If the site doesn't answer, each page falls back to a snapshot bundled at build time. On top of the live text sits a small set of curated claims with n and date. Each one is kept only while its exact quote is still on the site, and `/health` lists any that have dropped out.

| Tool | What it does |
|---|---|
| `check_citations(answer, sources)` | For each inline citation (`[doc_id:chunk_id]` or `[id]`), decides what word overlap can decide and hands the rest back. It uses CrossSource's claim-span pairing and failure taxonomy (`supported`, `right_doc_wrong_passage`, `wrong_document`, `unsupported_claim`). A cite to an id that isn't in `sources`, or one where another passage clearly covers the claim, gets a deterministic verdict with the reason. Everything else returns `needs_judgment` with CrossSource's judge prompt, for your model to apply. With `use_client_model: true` your client's model judges them through MCP sampling (stdio clients that support it). |
| `verify_claim(claim)` | Checks a claim or number about Zoeb Nomi against what zoebnomi.com says right now. Returns `found`, `number_mismatch` or `not_found`, with the site's quote, source URL, evidence link, and n and date where the site gives them. |
| `fit_to_role(job_description)` | Maps a JD to his public work with quoted evidence picked from the live site, and lists requirements with no public evidence as gaps. It never answers compensation, availability, location or work authorization. |

Resources, all generated from the live site: `zoebnomi://llms.txt`, `zoebnomi://case-studies` (every case study with its key facts), `zoebnomi://writing` (every essay and note with its finding), and `zoebnomi://harness`, a live, read-only summary from the public agent ledger behind the harness panel on zoebnomi.com.

## Eval of the tools themselves

`npm run eval` is deterministic and offline. Full tables are in [eval/RESULTS.md](eval/RESULTS.md).

**`check_citations`** is scored on CrossSource v0.3 `citation_check`: 75 items with final adjudicated labels, each a claim, a cited chunk and 5 context chunks. The split was fixed before tuning: 25 dev items, 50 test items. Thresholds were tuned on dev only.

| Test split (n = 50) | |
|---|---|
| Decided deterministically | 16 of 50 (32%) |
| Correct when decided | 16 of 16 |
| Called "supported" wrongly | 0 (it never says supported on its own) |
| `wrong_document` caught | 10 of 10 |
| `right_doc_wrong_passage` caught | 6 of 10 (4 deferred) |
| `supported` and `unsupported_claim` | all 30 deferred to the judge, by design |

Word overlap reliably catches a citation that points at the wrong place. It can't tell a faithful paraphrase from a reversed holding, so those go to a judge with CrossSource's prompt. For reference, the CrossSource harness reports that prompt with `claude-sonnet-5-5` at `citation_check` accuracy 1.00 on a 30-item sanity sample, not a full run.

**`verify_claim`** is scored on 28 queries written before the matcher ran: 15 true claims, 6 with a wrong number, and 7 the site does not support. It runs against the same index the server builds from the site, made here from the snapshot so the run is reproducible. **26 of 28 pass.** The first miss is vc-08, which matched the site's own note "Claude cited my site on 0 of 63 probes. Twice.". That is the same fact, but the fixed pass rule expects the curated quote, so it is scored as a miss. The second: "the eyecite pull request was merged" comes back `found`, quoting the site's line about the open, not merged pull requests. A word lookup can't see negation, so the tool tells callers to repeat the site's quote, not their own wording.

## Install

The remote endpoint will be `https://mcp.zoebnomi.com/mcp`. It and the npm package are **not published yet**; each line below works once they are. Until then, use the local build (see Develop).

**Claude Code**

```bash
claude mcp add --transport stdio zoebnomi -- npx -y zoebnomi mcp
```

```bash
claude mcp add --transport http zoebnomi https://mcp.zoebnomi.com/mcp
```

**Claude (claude.ai, desktop)**: Customize > Connectors > Add custom connector, paste `https://mcp.zoebnomi.com/mcp`, and choose "No sign in".

**ChatGPT**: add a custom MCP server with the endpoint `https://mcp.zoebnomi.com/mcp` and no authentication. OpenAI's docs describe this flow under Plugins ("Add custom MCP server"). Older guides call it developer mode. Check the current path in [OpenAI's docs](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt).

**Cursor**: add this to `.cursor/mcp.json` or `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "zoebnomi": { "command": "npx", "args": ["-y", "zoebnomi", "mcp"] } } }
```

or use the install link `cursor://anysphere.cursor-deeplink/mcp/install?name=zoebnomi&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInpvZWJub21pIiwibWNwIl19`.

**MCP Registry**: listed as `io.github.zoeb-nomi/zoebnomi` once published ([server.json](server.json)).

**Claude Skill**: [skill/evals-the-zoeb-way](skill/evals-the-zoeb-way/SKILL.md) covers golden datasets, judge calibration and the citation check. In Claude Code, copy the folder to `~/.claude/skills/`. In claude.ai, zip the folder and upload it under Customize > Skills.

## CLI

```bash
npx zoebnomi
```

```bash
npx zoebnomi check-citations answer.json --strict
```

```bash
npx zoebnomi verify "CrossSource lifted citation precision to 0.994"
```

```bash
npx zoebnomi fit jd.txt
```

- With no command, it prints the card.
- `check-citations` takes a file holding `{"answer": "...", "sources": [{"id": "...", "text": "..."}]}`, or `-` to read stdin. `--strict` exits 1 when any citation is decided as a failure, so it can gate CI. `--json` prints the full result, judge prompts included.
- `npx zoebnomi mcp` runs the MCP server on stdio.

## Develop

Node 20+. TypeScript 7, the MCP TypeScript SDK, and no other runtime dependencies besides zod.

```bash
npm install
```

```bash
npm test
```

```bash
npm run eval
```

```bash
npm run build
```

```bash
npm run worker:dry-run && node scripts/smoke.ts bundle .wrangler-dry/worker.js
```

- `npm test`: 39 tests. They cover the tools and the MCP client end to end, over the in-memory/stdio path and over Streamable HTTP through the Worker handler, plus MCP sampling. Live behaviour is tested against a fake site: a new note is found and listed, a changed number drops the curated claim, a dead site falls back to the snapshot, and contact lines are redacted. House rules are tests too: every quote must be on the site, and there must be no dashes, banned overstatements or personal details.
- `npm run worker:dry-run` bundles the Worker without contacting Cloudflare. The smoke script then lists and calls every tool and reads every resource against that bundle.
- Publishing, rollback and what to watch: [PUBLISH.md](PUBLISH.md) (browser only: GitHub web UI and Cloudflare Workers Builds).
- `node scripts/smoke.ts https://mcp.zoebnomi.com` is the post-deploy check. `GET https://mcp.zoebnomi.com/health` is the heartbeat.
- `npx @modelcontextprotocol/inspector --cli node dist/stdio.js --method tools/list` runs the official Inspector against the stdio build.
- `npm run snapshot` refreshes the fallback snapshot. If a curated quote has left the site, `npm test` then fails; live, `/health` shows it under `curated_dropped`.

Layout: `src/server.ts` (tools and resources), `src/worker.ts` (Cloudflare Worker: `/mcp` stateless Streamable HTTP, `/health`), `src/stdio.ts`, `src/cli.ts`, `src/site.ts` (live read, cache, fallback, redaction), `src/siteindex.ts` (parses the site into quotable entries, layers the curated claims), `src/citations.ts`, `src/verify.ts`, `src/fit.ts`, `src/data/claims.ts` (curated claims), `src/data/snapshot.ts` (generated fallback), `eval/`, `skill/`.

## Provenance and limits

- Facts come only from public zoebnomi.com text (llms.txt and the case-study pages), read live with a snapshot fallback. Every response says which one it used (`index.source`: live, snapshot or mixed). Contact, booking and location lines are removed before any tool sees the text.
- Cost: no model calls. Each process or Worker isolate fetches four small pages at most once every 15 minutes, with a Cloudflare edge-cache hint, so traffic does not multiply requests to the site.
- `check_citations` keeps CrossSource's pairing, taxonomy, missing-id rule and judge prompt. It differs in two places: it accepts any `[id]` as well as `[doc_id:chunk_id]`, and it trims punctuation left over from the previous sentence.
- `fit_to_role` maps keywords. A hit means related public work exists. It does not mean the requirement is fully met, so read the quotes.
- Remote over HTTP is stateless, so MCP sampling (`use_client_model`) works over stdio only.

MIT. The CrossSource-derived eval data carries CrossSource's MIT notice ([eval/data/README.md](eval/data/README.md)).
