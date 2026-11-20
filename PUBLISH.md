# Publish, verify, roll back

Everything here is done in a browser: GitHub's web UI and the Cloudflare dashboard. No terminal. Claude prepares and checks; Zoeb clicks publish.

Cloudflare account: the one that holds zoebnomi.com and the `agent-ledger` Worker (Workers Free plan). Worker name: `zoebnomi-mcp` (must match `name` in `wrangler.toml`, or Workers Builds fails). Public URL: `https://mcp.zoebnomi.com/mcp`.

## First publish

**1. Create the GitHub repo (once).**
1. Open https://github.com/new. Owner `zoeb-nomi`, name `zoebnomi-mcp`, Public, no README, no licence, no .gitignore (the repo has its own).
2. On the empty repo page choose "uploading an existing file" and drag in the contents of the clean upload folder Claude prepares (`upload/zoebnomi-mcp/` in the local repo: the committed files only, no `node_modules`). Commit to `main` with the message given in the handover.
3. The web upload skips dotfiles, so add `.gitignore` by hand: Add file > Create new file, name `.gitignore`, paste the contents from the handover, commit to `main`.

**2. Connect Cloudflare Workers Builds (once).**
1. Cloudflare dashboard > Workers & Pages > Create application > Import a repository > GitHub. Authorise the Cloudflare GitHub app for `zoeb-nomi/zoebnomi-mcp` if asked.
2. Select `zoebnomi-mcp`. Set:
   - Project name: `zoebnomi-mcp`
   - Build command: `npm ci && npm test` (a failing test stops the deploy)
   - Deploy command: `npx wrangler deploy` (the default)
   - Root directory: `/`
   - Production branch: `main`
3. Save and Deploy. The deploy creates the `mcp.zoebnomi.com` DNS record and certificate from `wrangler.toml`. Builds uses Node 24 by default.

**3. Check it.** Open https://mcp.zoebnomi.com/health. Expect `"ok": true` with `"source": "live"`. A 503 lists its reasons under `problems`. Then tell Claude it is published: `post-publish-verify` runs the smoke test (`scripts/smoke.ts`) and the MCP Inspector against the live URL, reads CPU time in Workers Logs, and adds the rate-limit rule below.

## Rate-limit rule (after the first deploy)

zoebnomi.com > Security > Security rules > Rate limiting rules > Create rule: when Hostname equals `mcp.zoebnomi.com`, more than 30 requests per 10 seconds from one IP, block for 10 seconds. The free plan allows one such rule. It protects the account's shared daily Workers quota (100,000 requests on Free, shared with `agent-ledger`).

## Later changes

Edit or upload files in GitHub's web UI and commit to `main`. Workers Builds runs the tests and deploys if they pass. A failed build leaves the live version untouched; the build log is under the Worker's Deployments tab.

`OPENAI_APPS_CHALLENGE` lives in `wrangler.toml`. Each build deploys the file's value, so set the OpenAI token there (not in the dashboard), or the next build wipes it.

## Roll back

- **Last good version:** Workers & Pages > `zoebnomi-mcp` > Deployments, pick the previous version, Rollback. Instant; the next push to `main` deploys again.
- **Take the endpoint offline:** Workers & Pages > `zoebnomi-mcp` > Settings > Domains & Routes, remove `mcp.zoebnomi.com`. The Worker stays; the URL stops answering.
- **Undo a bad commit:** revert it in GitHub (the commit page > Revert, or edit the file back) and commit to `main`.

## What to watch

- `/health` returns 503 when the site was not read live, the index looks broken (for example after an llms.txt format change in the Portfolio repo) or more than 5 curated claims have left the site.
- Workers Logs (Worker > Observability) shows `site_fallback`, `ledger_unavailable`, `health_degraded` and `mcp_unhandled` events, and CPU time per request. On the Free plan a request over 10 ms CPU fails; normal calls measured 1 to 2 ms, the largest allowed `check_citations` about 15 ms, a cold first request about 30 ms (Node, locally, 2026-11-20). If real traffic shows CPU-limit errors, the fix is the Workers Paid plan ($5/month), Zoeb's call.
