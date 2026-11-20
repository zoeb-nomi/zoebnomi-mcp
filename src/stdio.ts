// stdio entry: `npx -y zoebnomi mcp`, or `node dist/stdio.js`.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.ts';

export async function runStdio(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

if (isMain()) {
  runStdio().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

function isMain(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
