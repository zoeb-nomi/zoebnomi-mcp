# Privacy

Applies to the remote server at https://mcp.zoebnomi.com/mcp, the `zoebnomi` CLI and the stdio server. Last updated 2026-11-20.

- **What the server receives:** the arguments you pass to a tool (an answer and its sources, a claim, or a job description).
- **What it does with them:** computes a result in memory and returns it. No database, no storage of your input, no cookies, no accounts, no model calls. Your input is not used for training and is not shared with anyone.
- **Logs:** the remote server runs on Cloudflare Workers. Cloudflare Workers Logs records request metadata for each call (for example time, URL, status, headers and approximate location), not the request body, and keeps it for 3 days. The server itself logs only operational events, such as a page of zoebnomi.com not answering; it never logs tool arguments.
- **Rate limiting:** Cloudflare counts requests per IP address to block bursts (more than 30 requests in 10 seconds).
- **Outbound requests:** only to Zoeb Nomi's own public pages. The server reads zoebnomi.com (cached for 15 minutes), and reading the `zoebnomi://harness` resource fetches a public summary from his agent ledger. Nothing you send is included in those requests.
- **The CLI and stdio server** run entirely on your machine; they read zoebnomi.com the same way.
- **Contact:** through https://www.zoebnomi.com.
