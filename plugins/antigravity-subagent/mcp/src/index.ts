import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { VERSION, checkAgy, delegateAgy } from '../../skills/delegate-to-antigravity/scripts/agy-runtime.mjs';

function errorResult(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: `Antigravity delegation failed: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  };
}

function createServer(): McpServer {
  const server = new McpServer(
    { name: 'agy-mcp-server', version: VERSION },
    { instructions: 'Use agy_check before first delegation to probe version and capabilities; it does not verify authentication. Default agy_delegate to plan mode. Verify delegated output and workspace changes independently.' },
  );
  server.registerTool('agy_check', {
    title: 'Check Antigravity CLI',
    description: 'Probe the installed Antigravity CLI executable, version and required headless capabilities. Authentication is checked only by an actual delegation.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true },
  }, async () => {
    try {
      const check = await checkAgy();
      return {
        content: [{ type: 'text', text: `Antigravity CLI is available at: ${check.executable}\nCLI version: ${check.cliVersion}\nPrompt transport: ${check.capabilities.streamInput ? 'stream-json stdin' : 'legacy argv'}\nAuthentication has not been checked.` }],
        structuredContent: check,
      };
    } catch (error) { return errorResult(error); }
  });
  server.registerTool('agy_delegate', {
    title: 'Delegate to Antigravity',
    description: 'Run one bounded prompt through Antigravity headless mode. Uses stdin streaming when supported and validates the terminal result status.',
    inputSchema: z.object({
      prompt: z.string().min(1).max(100_000).describe('Complete bounded task prompt'),
      cwd: z.string().min(1).describe('Absolute existing workspace directory'),
      mode: z.enum(['plan', 'default', 'accept-edits']).default('plan').describe('default omits --mode and preserves the CLI policy'),
      outputFormat: z.enum(['text', 'json']).default('text'),
      timeoutSeconds: z.number().int().min(1).max(1800).default(900),
      agent: z.string().min(1).max(200).optional(),
      model: z.string().min(1).max(200).optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true, idempotentHint: false },
  }, async (options) => {
    try {
      const result = await delegateAgy(options);
      const summary = [result.output.trim()];
      if (result.stderr.trim()) summary.push(`stderr:\n${result.stderr.trim()}`);
      if (result.error) summary.push(result.error);
      return {
        content: [{ type: 'text', text: summary.filter(Boolean).join('\n\n') || '(Antigravity returned no output)' }],
        structuredContent: {
          exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated,
          mode: result.mode, cwd: result.cwd, cliVersion: result.cliVersion, transport: result.transport,
          status: result.status, conversationId: result.conversationId,
        },
        isError: result.isError,
      };
    } catch (error) { return errorResult(error); }
  });
  return server;
}

void serveStdio(createServer);
console.error(`agy MCP server ${VERSION} running on stdio`);
