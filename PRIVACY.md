# Privacy (draft, not yet published)

Draft for the listing pages. Confirm the Cloudflare log retention line against the account's settings before publishing.

- **What the server receives:** the arguments you pass to a tool (an answer and its sources, a claim, or a job description).
- **What it does with them:** computes a result in memory and returns it. No database, no storage, no cookies, no accounts, and no model calls. Nothing you send is used for training or shared with anyone.
- **Logs:** the remote endpoint runs on Cloudflare Workers, which records request metadata (for example time, path and status) in Workers Logs. The server does not log tool arguments. Retention follows the Cloudflare account's Workers Logs settings.
- **Outbound requests:** only to Zoeb's own public pages. The server reads zoebnomi.com (cached for 15 minutes), and reading the `zoebnomi://harness` resource fetches a public summary from his agent ledger. Nothing you send is included in those requests.
- **The local CLI and stdio server** run entirely on your machine.
- **Contact:** via https://www.zoebnomi.com.
