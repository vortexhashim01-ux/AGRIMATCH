import { connectDB } from './config/db';
import { startStdioMcpServer } from './mcp.server';

async function main(): Promise<void> {
  try {
    await connectDB(1, 500);
  } catch (e: any) {
    console.warn(
      '[mcp:stdio] Could not connect DB — tools that need DB will fall back gracefully:',
      e.message
    );
  }
  await startStdioMcpServer();
}

main().catch((err: Error) => {
  console.error('[mcp:stdio] Fatal startup error:', err);
  process.exit(1);
});
