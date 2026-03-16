/**
 * Tool Registry
 *
 * Central registry for all Underlord video editing tools.
 * Each registered tool works for both:
 *   - OpenAI-compatible function calling (underlordService)
 *   - MCP protocol (mcp-server)
 *
 * Adding a new tool = create one .tool.ts file and call toolRegistry.register().
 * No changes needed to underlordService or any other file.
 */

import OpenAI from 'openai';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ToolContext {
  mediaId: string;
  mediaFilePath?: string;
}

/** A cut region produced by edit operations */
export interface CutRegionResult {
  startTime: number;
  endTime: number;
}

/** Timeline patch describing the result of any tool execution */
export type TimelinePatch =
  | { op: 'remove_segments'; segments: CutRegionResult[] }
  | { op: 'add_dubbing'; audioUrl: string; segments: { part: string; start: number; end: number }[] };

export interface ToolDefinition {
  name: string;
  label: string;
  category: 'cut' | 'audio' | 'overlay' | 'export';

  /** Schema for OpenAI function calling */
  functionSchema: OpenAI.Chat.ChatCompletionTool;

  /** Schema for MCP protocol */
  mcpSchema: {
    name: string;
    description: string;
    inputSchema: object;
  };

  /** Optional: keyword regex for fallback when function calling is unavailable */
  fallbackPattern?: RegExp;

  /** Extract params from the regex match (required if fallbackPattern is set) */
  fallbackParams?: (match: RegExpMatchArray, message: string) => Record<string, any>;

  /**
   * Cut-based executor: returns segments to cut (used by remove_fillers, remove_silence, etc.)
   * Required unless executePatch is provided.
   */
  execute?: (params: Record<string, any>, context: ToolContext) => Promise<CutRegionResult[]>;

  /**
   * Patch-based executor: returns a full TimelinePatch (used by add_dubbing and future non-cut tools).
   * Takes priority over execute when both are present.
   */
  executePatch?: (params: Record<string, any>, context: ToolContext) => Promise<TimelinePatch>;
}

interface UnhandledEntry {
  timestamp: string;
  message: string;
}

// ── ToolRegistry class ───────────────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private unhandledLog: UnhandledEntry[] = [];

  register(def: ToolDefinition): void {
    this.tools.set(def.name, def);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Returns OpenAI function calling tool array — pass directly to chat.completions.create() */
  getOpenAITools(): OpenAI.Chat.ChatCompletionTool[] {
    return [...this.tools.values()].map(t => t.functionSchema);
  }

  /** Returns MCP tool descriptors — pass to MCP server registration */
  getMCPTools(): { name: string; description: string; inputSchema: object }[] {
    return [...this.tools.values()].map(t => t.mcpSchema);
  }

  /** Execute a registered tool by name — returns CutRegionResult[] (cut-based tools only) */
  async execute(name: string, params: Record<string, any>, context: ToolContext): Promise<CutRegionResult[]> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`未知工具: ${name}`);
    if (!tool.execute) throw new Error(`工具 ${name} 不是剪切类工具，请使用 executeTool`);
    return tool.execute(params, context);
  }

  /**
   * Execute a registered tool and return a TimelinePatch.
   * Works for both cut-based tools (wraps result in remove_segments) and patch-based tools.
   */
  async executeTool(name: string, params: Record<string, any>, context: ToolContext): Promise<TimelinePatch> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`未知工具: ${name}`);
    if (tool.executePatch) return tool.executePatch(params, context);
    if (tool.execute) {
      const cuts = await tool.execute(params, context);
      return { op: 'remove_segments', segments: cuts };
    }
    throw new Error(`工具 ${name} 没有执行器`);
  }

  /** Human-readable list of supported operations (for system prompt injection) */
  describeCapabilities(): string {
    return [...this.tools.values()].map(t => t.label).join('、');
  }

  /**
   * Keyword fallback: try to match a message against each tool's fallbackPattern.
   * Returns { name, params } or null if nothing matches.
   */
  fallbackMatch(message: string): { name: string; params: Record<string, any> } | null {
    for (const tool of this.tools.values()) {
      if (!tool.fallbackPattern) continue;
      const match = message.match(tool.fallbackPattern);
      if (match) {
        return {
          name: tool.name,
          params: tool.fallbackParams ? tool.fallbackParams(match, message) : {},
        };
      }
    }
    return null;
  }

  /** Log a request that no tool could handle — useful for discovering new feature needs */
  logUnhandledRequest(message: string): void {
    this.unhandledLog.push({ timestamp: new Date().toISOString(), message });
    console.warn(`[ToolRegistry] Unhandled request: "${message.slice(0, 80)}"`);
  }

  getUnhandledLog(): UnhandledEntry[] {
    return [...this.unhandledLog];
  }
}

// ── Global singleton ─────────────────────────────────────────────────────────

export const toolRegistry = new ToolRegistry();
