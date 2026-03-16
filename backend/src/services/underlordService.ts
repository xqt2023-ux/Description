/**
 * Underlord Service
 *
 * Fully generic — all tool knowledge lives in the ToolRegistry.
 * To add a new editing capability: create a .tool.ts file, register it,
 * and this service picks it up automatically with zero changes here.
 *
 * Architecture:
 *  1. Stream conversational response (natural language only, no JSON)
 *  2. Parse intent via function calling → toolRegistry.execute()
 *     - LLM may also call ask_question to collect a missing parameter
 *  3. Fallback: toolRegistry.fallbackMatch() (keyword matching)
 *  4. Unknown intent → log + inform user of supported operations
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { MediaInfo } from './videoEditOrchestration';
import { toolRegistry } from './toolRegistry';

// Side-effect: registers all tools into toolRegistry
import './tools/index';

// ── Question definition (shared with frontend via SSE) ─────────────────────

export interface QuestionDef {
  kind: 'number' | 'choice' | 'position' | 'file';
  key: string;
  label: string;
  // number
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // choice
  options?: Array<{ label: string; value: string }>;
  // file
  accept?: string;
}

// ── SSE event protocol ─────────────────────────────────────────────────────

type TimelinePatch =
  | { op: 'remove_segments'; segments: { startTime: number; endTime: number }[] }
  | { op: 'restore_segments'; segments: { startTime: number; endTime: number }[] }
  | { op: 'add_transition'; afterClipId: string; transition: object }
  | { op: 'add_overlay'; overlay: object }
  | { op: 'apply_audio_effect'; effect: string }
  | { op: 'add_dubbing'; segments: object[] };

export type SSEEvent =
  | { type: 'text'; delta: string }
  | { type: 'plan'; steps: string[] }
  | { type: 'step_start'; name: string }
  | { type: 'step_done'; name: string; durationMs: number; patch?: TimelinePatch }
  | { type: 'done'; operationId: string }
  | { type: 'error'; message: string }
  | { type: 'question'; question: QuestionDef };

// ── ask_question tool definition ───────────────────────────────────────────

const ASK_QUESTION_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'ask_question',
    description:
      'Ask the user a clarifying question using a specific UI widget. ' +
      'Use this when you need a parameter value that the user has not yet provided. ' +
      'If the user already stated the value in their message or conversation history, use it directly without asking.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['number', 'choice', 'position', 'file'],
          description: 'Widget type: number=slider, choice=buttons, position=3x3 grid, file=upload zone',
        },
        key: { type: 'string', description: 'Parameter name, e.g. "threshold"' },
        label: { type: 'string', description: 'Question to display to the user' },
        default: { type: 'number', description: 'Default value (number kind)' },
        min: { type: 'number', description: 'Minimum value (number kind)' },
        max: { type: 'number', description: 'Maximum value (number kind)' },
        step: { type: 'number', description: 'Step size (number kind)' },
        unit: { type: 'string', description: 'Unit label, e.g. "秒" (number kind)' },
        options: {
          type: 'array',
          description: 'Options (choice kind)',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        accept: { type: 'string', description: 'MIME types to accept, e.g. "image/*" (file kind)' },
      },
      required: ['kind', 'key', 'label'],
    },
  },
};

// ── Build AI client ────────────────────────────────────────────────────────

function buildAIClient(): OpenAI | null {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  if (process.env.BABELARK_API_KEY) {
    return new OpenAI({
      apiKey: process.env.BABELARK_API_KEY,
      baseURL: 'https://api.babelark.com/v1',
      httpAgent,
    } as any);
  }

  if (process.env.OPENAI_API_KEY) {
    const config: any = { apiKey: process.env.OPENAI_API_KEY, httpAgent };
    if (process.env.OPENAI_BASE_URL) config.baseURL = process.env.OPENAI_BASE_URL;
    return new OpenAI(config);
  }

  return null;
}

// ── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const capabilities = toolRegistry.describeCapabilities();
  return `You are Underlord, an AI assistant inside a professional video editor.
When the user asks you to edit their video, respond conversationally in 1-2 sentences.
Respond in the same language the user uses (Chinese or English).
Be concise and confident. Do NOT list steps, do NOT output JSON or code blocks.

Currently supported operations: ${capabilities}.

Parameter collection rules:
- If you need a parameter the user has NOT provided, call ask_question to show an interactive widget.
- If the user already stated the value (e.g. "remove silence over 2 seconds"), use it directly — do NOT ask again.
- User answers appear in conversation history as "[key: value]".

If the user requests something NOT in the supported operations list, respond with a friendly message listing what you can do.`;
}

// ── Intent parsing via function calling ───────────────────────────────────

async function parseIntent(
  client: OpenAI,
  model: string,
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ name: string; params: Record<string, any> } | null> {
  try {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 256,
      messages: [
        ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ],
      tools: [...toolRegistry.getOpenAITools(), ASK_QUESTION_TOOL],
      tool_choice: 'auto',
    });

    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call) return null;

    const name = call.function.name;
    if (!toolRegistry.has(name) && name !== 'ask_question') return null;

    return { name, params: JSON.parse(call.function.arguments || '{}') };
  } catch (err: any) {
    console.warn('[underlordService] Function calling failed, falling back to keyword match:', err.message);
    return null;
  }
}

// ── Main chat function ─────────────────────────────────────────────────────

let opCounter = 0;

export async function chat(
  params: {
    message: string;
    mediaId: string;
    mediaInfo: MediaInfo | { duration: number; hasAudio: boolean };
    conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
    mediaFilePath?: string;
  },
  emit: (event: SSEEvent) => void
): Promise<void> {
  const client = buildAIClient();
  const model = process.env.BABELARK_MODEL || 'claude-opus-4-6';

  // 1. Stream conversational response
  if (!client) {
    emit({ type: 'text', delta: '好的，我来帮你处理...' });
  } else {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt() },
      ...(params.conversationHistory || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: params.message },
    ];

    try {
      const stream = await client.chat.completions.create({
        model,
        max_tokens: 128,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) emit({ type: 'text', delta });
      }
    } catch (err: any) {
      emit({ type: 'text', delta: '正在处理你的请求...' });
      console.error('[underlordService] Stream error:', err.message);
    }
  }

  // 2. Parse intent — function calling first, then keyword fallback
  let intent: { name: string; params: Record<string, any> } | null = null;

  if (client) {
    intent = await parseIntent(client, model, params.message, params.conversationHistory ?? []);
  }

  // ask_question is only from LLM — no keyword fallback for it
  if (!intent || intent.name === 'ask_question') {
    if (intent?.name === 'ask_question') {
      // LLM wants to collect a parameter — emit widget event and stop
      emit({ type: 'question', question: intent.params as QuestionDef });
      emit({ type: 'done', operationId: '' });
      return;
    }
    intent = toolRegistry.fallbackMatch(params.message);
  }

  if (!intent) {
    toolRegistry.logUnhandledRequest(params.message);
    emit({ type: 'done', operationId: '' });
    return;
  }

  // 3. Execute via registry + emit patch
  const tool = toolRegistry.getAll().find(t => t.name === intent!.name);
  const label = tool?.label ?? intent.name;

  emit({ type: 'plan', steps: [label] });

  const startMs = Date.now();
  emit({ type: 'step_start', name: label });

  try {
    const patch = await toolRegistry.executeTool(intent.name, intent.params, {
      mediaId: params.mediaId,
      mediaFilePath: params.mediaFilePath,
    });

    emit({
      type: 'step_done',
      name: label,
      durationMs: Date.now() - startMs,
      patch,
    });
    emit({ type: 'done', operationId: `op-${++opCounter}` });
  } catch (err: any) {
    emit({ type: 'error', message: err.message || '执行失败' });
  }
}
