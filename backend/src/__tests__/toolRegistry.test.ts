/**
 * TDD tests for ToolRegistry
 *
 * Uses a fresh ToolRegistry instance per test (not the global singleton)
 * to avoid cross-test contamination.
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry, ToolDefinition } from '../services/toolRegistry';

// ── Test fixture ────────────────────────────────────────────────────────────

function makeTool(name: string, label: string, executor?: () => Promise<any>): ToolDefinition {
  return {
    name,
    label,
    category: 'cut',
    functionSchema: {
      type: 'function',
      function: {
        name,
        description: `Tool: ${name}`,
        parameters: { type: 'object', properties: {} },
      },
    },
    mcpSchema: {
      name,
      description: `Tool: ${name}`,
      inputSchema: { type: 'object', properties: { mediaId: { type: 'string' } }, required: ['mediaId'] },
    },
    execute: executor ?? vi.fn().mockResolvedValue([]),
  };
}

// ── has / register ───────────────────────────────────────────────────────────

describe('ToolRegistry.has', () => {
  it('returns false for unregistered tool', () => {
    const r = new ToolRegistry();
    expect(r.has('unknown')).toBe(false);
  });

  it('returns true after register', () => {
    const r = new ToolRegistry();
    r.register(makeTool('my_tool', '我的工具'));
    expect(r.has('my_tool')).toBe(true);
  });
});

// ── getOpenAITools ───────────────────────────────────────────────────────────

describe('ToolRegistry.getOpenAITools', () => {
  it('returns empty array when no tools registered', () => {
    const r = new ToolRegistry();
    expect(r.getOpenAITools()).toEqual([]);
  });

  it('returns function schemas for all registered tools', () => {
    const r = new ToolRegistry();
    r.register(makeTool('tool_a', 'A'));
    r.register(makeTool('tool_b', 'B'));
    const tools = r.getOpenAITools();
    expect(tools).toHaveLength(2);
    expect(tools[0].function.name).toBe('tool_a');
    expect(tools[1].function.name).toBe('tool_b');
  });
});

// ── getMCPTools ──────────────────────────────────────────────────────────────

describe('ToolRegistry.getMCPTools', () => {
  it('returns MCP schemas for all registered tools', () => {
    const r = new ToolRegistry();
    r.register(makeTool('tool_a', 'A'));
    const tools = r.getMCPTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('tool_a');
    expect(tools[0].inputSchema).toBeDefined();
  });
});

// ── execute ──────────────────────────────────────────────────────────────────

describe('ToolRegistry.execute', () => {
  it('calls the tool executor with params and context', async () => {
    const executor = vi.fn().mockResolvedValue([{ startTime: 1, endTime: 2 }]);
    const r = new ToolRegistry();
    r.register(makeTool('my_tool', '测试', executor));

    const result = await r.execute('my_tool', { foo: 'bar' }, { mediaId: 'media-1' });

    expect(executor).toHaveBeenCalledWith({ foo: 'bar' }, { mediaId: 'media-1' });
    expect(result).toEqual([{ startTime: 1, endTime: 2 }]);
  });

  it('throws for unknown tool name', async () => {
    const r = new ToolRegistry();
    await expect(r.execute('not_exists', {}, { mediaId: 'x' })).rejects.toThrow('未知工具: not_exists');
  });
});

// ── describeCapabilities ─────────────────────────────────────────────────────

describe('ToolRegistry.describeCapabilities', () => {
  it('returns empty string when no tools registered', () => {
    const r = new ToolRegistry();
    expect(r.describeCapabilities()).toBe('');
  });

  it('returns comma-joined labels of registered tools', () => {
    const r = new ToolRegistry();
    r.register(makeTool('remove_fillers', '去除填充词'));
    r.register(makeTool('cut_segment', '剪切片段'));
    expect(r.describeCapabilities()).toBe('去除填充词、剪切片段');
  });
});

// ── fallback pattern ─────────────────────────────────────────────────────────

describe('ToolRegistry.fallbackMatch', () => {
  it('returns null when no tools have fallback patterns', () => {
    const r = new ToolRegistry();
    r.register(makeTool('remove_fillers', '去除填充词'));
    expect(r.fallbackMatch('去掉嗯啊')).toBeNull();
  });

  it('matches a tool by its fallback pattern', () => {
    const r = new ToolRegistry();
    r.register({
      ...makeTool('remove_fillers', '去除填充词'),
      fallbackPattern: /嗯|啊|填充词|filler/i,
      fallbackParams: () => ({}),
    });
    const match = r.fallbackMatch('帮我去掉视频里的嗯啊');
    expect(match).toEqual({ name: 'remove_fillers', params: {} });
  });

  it('returns null when no pattern matches the message', () => {
    const r = new ToolRegistry();
    r.register({
      ...makeTool('remove_fillers', '去除填充词'),
      fallbackPattern: /嗯|啊|填充词|filler/i,
      fallbackParams: () => ({}),
    });
    expect(r.fallbackMatch('给视频加字幕')).toBeNull();
  });

  it('extracts params using fallbackParams function', () => {
    const r = new ToolRegistry();
    r.register({
      ...makeTool('cut_segment', '剪切片段'),
      fallbackPattern: /(\d+(?:\.\d+)?)\s*[秒s].*?(\d+(?:\.\d+)?)\s*[秒s]/,
      fallbackParams: (match) => ({ startTime: +match[1], endTime: +match[2] }),
    });
    const result = r.fallbackMatch('删除 5秒 到 10秒 的片段');
    expect(result).toEqual({ name: 'cut_segment', params: { startTime: 5, endTime: 10 } });
  });
});

// ── logUnhandledRequest ──────────────────────────────────────────────────────

describe('ToolRegistry.logUnhandledRequest', () => {
  it('records unhandled requests and returns them via getUnhandledLog', () => {
    const r = new ToolRegistry();
    r.logUnhandledRequest('请帮我给视频加字幕');
    r.logUnhandledRequest('我想要背景音乐');
    const log = r.getUnhandledLog();
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('请帮我给视频加字幕');
    expect(log[1].message).toBe('我想要背景音乐');
    expect(log[0].timestamp).toBeDefined();
  });
});
