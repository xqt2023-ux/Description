/**
 * MCP Tools Registry Initialization
 *
 * Registers all video editing tools into the toolRegistry,
 * then exposes them via MCP protocol for Claude native tool calling.
 *
 * MCP schema format: { name, description, inputSchema }
 * Mirrors the OpenAI function calling schema but follows Anthropic's MCP spec.
 */

import { toolRegistry } from '../../services/toolRegistry';

// Side-effect import: registers all tools into the global registry
import '../../services/tools/index';

/**
 * Initialize MCP tools registry.
 * Called once at server startup (backend/src/index.ts).
 */
export async function initializeTools(): Promise<void> {
  const tools = toolRegistry.getMCPTools();
  const capabilities = toolRegistry.describeCapabilities();

  console.log(`✓ MCP Tools registered (${tools.length}): ${capabilities}`);

  // Future: if using a real MCP transport (stdio / SSE),
  // register tools with the MCP server instance here:
  //
  // for (const tool of tools) {
  //   mcpServer.registerTool(tool.name, tool.description, tool.inputSchema,
  //     async (input) => toolRegistry.execute(tool.name, input, { mediaId: input.mediaId })
  //   );
  // }
}
