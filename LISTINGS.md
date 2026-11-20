# Listings checklist

Requirements checked on the web on 2026-11-20 against each directory's own docs (source URLs per section). Items marked UNVERIFIED could not be confirmed from an official page. Nothing has been submitted. Every submission goes through pre-upgrade-review and Zoeb's explicit yes.

## Decisions needed first (Zoeb)

- [x] **Custom domain: `mcp.zoebnomi.com`**, live since 2026-11-20 (Worker `zoebnomi-mcp`, deployed by Workers Builds from GitHub `main`; same Cloudflare account as zoebnomi.com). `workers_dev` is off, so the custom domain is the only public URL. A rate-limit rule (30 requests per 10 s per IP, block 10 s) protects it.
- [x] **Public GitHub repo** https://github.com/zoeb-nomi/zoebnomi-mcp (2026-11-20).
- [ ] **Privacy policy page** at a public HTTPS URL (Anthropic and OpenAI both ask). Draft in [PRIVACY.md](PRIVACY.md).
- [ ] **Support, terms and website URLs** (OpenAI requires all four, same publisher) and a square **icon**.
- [ ] **npm**: flip `"private": true` off in package.json, then `npm publish --access public`. The name `zoebnomi` was unclaimed on 2026-11-20.

Already done in v0: every tool has `title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` and `openWorldHint: false` (explicit booleans, the union of the Anthropic and OpenAI rules); tool names under 64 characters; descriptions contain no instructions to call other tools; `/health` heartbeat; `scripts/smoke.ts` for post-deploy checks; tested with the MCP Inspector CLI.

## 1. Official MCP Registry

Source: https://modelcontextprotocol.io/registry/quickstart , /registry/authentication , /registry/remote-servers , /registry/package-types. Status: preview.

- [x] `package.json` has `"mcpName": "io.github.zoeb-nomi/zoebnomi"`, equal to `name` in [server.json](server.json).
- [x] server.json `description` is 100 characters or fewer (85).
- [ ] Publish npm first (the Registry holds metadata only; the published version must contain `mcpName`).
- [x] `remotes: [{ "type": "streamable-http", "url": "https://mcp.zoebnomi.com/mcp" }]` is in server.json; publish only after the deploy is live, since the Registry expects a reachable URL.
- [ ] `brew install mcp-publisher`, `mcp-publisher validate`, `mcp-publisher login github` (namespace `io.github.zoeb-nomi/*`), `mcp-publisher publish`.
- [ ] Verify: `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=zoebnomi"`.
- Alternative namespace `com.zoebnomi/zoebnomi` (would match the domain) needs a DNS TXT record at the zoebnomi.com apex or `/.well-known/mcp-registry-auth` with an Ed25519 key. v0 keeps `io.github.zoeb-nomi/zoebnomi`, which needs only GitHub login.
- UNVERIFIED: whether the `packageArguments` shape in server.json passes the 2025-12-11 schema; `mcp-publisher validate` will say. Whether the schema has icon or website fields.

## 2. Anthropic: Claude Connectors Directory

Source: https://claude.com/docs/connectors/building/submission , https://claude.com/docs/connectors/building/review-criteria , https://claude.com/docs/directory/publish.md . Submit at https://claude.ai/directory/manage (paid plan).

- [x] No-auth servers are allowed for public data ("none").
- [x] Every tool has a title and readOnlyHint.
- [ ] Remote URL `https://mcp.zoebnomi.com/mcp`; do not block Anthropic egress (160.79.104.0/21) in any Cloudflare WAF or bot rule on the zoebnomi.com zone.
- [ ] Listing: name (100 characters or fewer), one-liner (200 or fewer), description (2000 or fewer), 1 to 5 categories, documentation URL (this README once public), privacy policy URL, support contact, icon (spec UNVERIFIED), permanent URL slug.
- [ ] Use cases, company info, data handling answers, test confirmation, seven compliance acknowledgements.
- The Skill is not a standalone submission: it ships inside a plugin bundle (`.claude-plugin/plugin.json`, public repo) submitted from the same portal. Plugin pre-submission checklist details UNVERIFIED.

Adding by URL (no listing needed): claude.ai Customize > Connectors > Add custom connector > `https://mcp.zoebnomi.com/mcp` > "No sign in". Claude Code: `claude mcp add --transport http zoebnomi https://mcp.zoebnomi.com/mcp`.

## 3. Claude Skill

Source: https://agentskills.io/specification.md , https://support.claude.com/en/articles/12512180-use-skills-in-claude , https://code.claude.com/docs/en/skills

- [x] `name` is lowercase with hyphens, 64 characters or fewer, and equals the folder name (`evals-the-zoeb-way`).
- [x] `description` is 1024 characters or fewer, saying what it does and when to use it.
- [x] Frontmatter uses only allowed keys (`name`, `description`, `license`); claude.ai upload rejects any others.
- [ ] Optional: `skills-ref validate skill/evals-the-zoeb-way`.
- Public skills directories with a submission process: only Anthropic's plugin-bundle route was confirmed. Third-party skill directories UNVERIFIED.

## 4. OpenAI: ChatGPT apps (now called plugins in the docs)

Source: https://developers.openai.com/apps-sdk/deploy/submission , https://developers.openai.com/apps-sdk/app-submission-guidelines , https://developers.openai.com/apps-sdk/deploy/connect-chatgpt

- [x] `readOnlyHint`, `destructiveHint`, `openWorldHint` set as explicit booleans on every tool. `openWorldHint` is false: `verify_claim` and `fit_to_role` read zoebnomi.com live, which is one fixed domain, not the open web. Revisit if a reviewer reads it differently.
- [x] The display name does not append "MCP" (the Worker's internal name `zoebnomi-mcp` is never shown).
- [ ] OpenAI Platform org with individual or business verification completed.
- [ ] Package ZIP with exactly one remote MCP server; listing fields (display name and short description 30 characters or fewer, long description 4000 or fewer).
- [ ] Four public HTTPS URLs: privacy policy, support, terms, website.
- [ ] Logo: square, PNG/JPEG/WebP/SVG, at least 48x48, 5 MiB or less.
- [x] The Worker serves `https://mcp.zoebnomi.com/.well-known/openai-apps-challenge` from the `OPENAI_APPS_CHALLENGE` var in wrangler.toml (empty means 404). [ ] Paste the portal's token there and redeploy when submitting.
- [ ] 5 positive and 3 negative test cases, a demo video URL, release notes.
- UNVERIFIED: the portal URL, the current "developer mode" path and plan eligibility, and whether no-auth plugins pass directory review (the portal accepts "none"; the guidelines don't say).

## 5. Cursor

Source: https://cursor.com/docs/context/mcp , https://cursor.com/docs/context/mcp/install-links , https://cursor.com/docs/plugins

- [x] `mcp.json` snippet and `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64>` link in the README.
- [ ] Optional marketplace: a Cursor plugin (`.cursor-plugin/plugin.json`, open source) submitted at https://cursor.com/marketplace/publish; manually reviewed. Form contents UNVERIFIED. cursor.directory's submit flow UNVERIFIED (HTTP 429).

## 6. Third-party directories

- **Glama** (https://glama.ai/mcp/faq): syncs servers from the official Registry hourly, so publishing there covers it. Claim via GitHub identity (`io.github.zoeb-nomi/*`).
- **PulseMCP** (https://www.pulsemcp.com/submit): not accepting submissions as of 2026-11-20; will pick up Registry listings.
- **mcp.so** (https://mcp.so/submit): submit a repo or server URL; reviewed before listing. Required fields and login UNVERIFIED.
- **Smithery**: UNVERIFIED (official docs returned 404). Snippets say external servers are published by URL at smithery.ai/new with a Smithery account. Read the live page before doing anything.

## Order

1. Public repo, privacy/support/terms pages, icon (domain decided: mcp.zoebnomi.com).
2. ~~Deploy the Worker to `mcp.zoebnomi.com`~~ Done 2026-11-20: pre-upgrade-review passed, smoke test and MCP Inspector pass against the live URL.
3. npm publish, then the Registry (feeds Glama and later PulseMCP).
4. Anthropic connector, then the plugin bundle with the Skill.
5. OpenAI, Cursor marketplace, mcp.so, Smithery.
