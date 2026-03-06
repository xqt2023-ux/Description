/**
 * Underlord Service
 *
 * Two-layer architecture:
 * 1. Conversational response — streams natural language via OpenAI-compatible API
 * 2. Intent parsing — function calling to detect edit action
 * 3. Executor — produces cutRegions[], emits TimelinePatch via SSE
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { MediaInfo } from './videoEditOrchestration';
import {
  executeRemoveFillers,
  executeCutSegment,
  executeRemoveSilence,
  executeRemoveBlackScreens,
} from './editExecutors';

// ── Event protocol ─────────────────────────────────────────────────────────────

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
  | { type: 'error'; message: string };

// ── Edit action types ──────────────────────────────────────────────────────────

type EditAction =
  | { type: 'remove_fillers'; params: { customWords?: string[] } }
  | { type: 'cut_segment'; params: { startTime: number; endTime: number } }
  | { type: 'remove_silence'; params: { threshold?: number; minDuration?: number } }
  | { type: 'remove_black_screens'; params: { minDuration?: number; threshold?: number } };

const ACTION_LABELS: Record<EditAction['type'], string> = {
  remove_fillers: '去除填充词',
  cut_segment: '剪切片段',
  remove_silence: '去除静默段',
  remove_black_screens: '去除黑屏',
};

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Underlord, an AI assistant inside a professional video editor.
When the user asks you to edit their video, respond conversationally in 1-2 sentences explaining what you are about to do.
Respond in the same language the user uses (Chinese or English).
Be concise and confident. Do NOT list steps, do NOT output JSON or code blocks.`;

// ── Function calling tools ────────────────────────────────────────────────────

const EDIT_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'remove_fillers',
      description: '删除视频中的填充词和口头禅（嗯、啊、那个、就是、um、uh、like）',
      parameters: {
        type: 'object',
        properties: {
          customWords: {
            type: 'array',
            items: { type: 'string' },
            description: '额外要删除的词（可选）',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cut_segment',
      description: '删除视频中指定时间范围内的片段',
      parameters: {
        type: 'object',
        required: ['startTime', 'endTime'],
        properties: {
          startTime: { type: 'number', description: '开始时间（秒）' },
          endTime:   { type: 'number', description: '结束时间（秒）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_silence',
      description: '自动检测并删除视频中的静默/停顿片段',
      parameters: {
        type: 'object',
        properties: {
          threshold:   { type: 'number', description: '静音阈值 dB，默认 -40' },
          minDuration: { type: 'number', description: '最短静默时长（秒），默认 0.5' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_black_screens',
      description: '自动检测并删除视频中的黑屏片段',
      parameters: {
        type: 'object',
        properties: {
          minDuration: { type: 'number', description: '最短黑屏时长（秒），默认 0.5' },
          threshold:   { type: 'number', description: '黑屏亮度阈值 0-1，默认 0.1' },
        },
      },
    },
  },
];

// ── Build AI client ────────────────────────────────────────────────────────────

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

// ── Keyword fallback intent parser ────────────────────────────────────────────

function fallbackParse(message: string): EditAction | null {
  if (/嗯|啊|那个|就是|填充词|口头禅|filler/i.test(message))
    return { type: 'remove_fillers', params: {} };

  const timeMatch = message.match(/(\d+(?:\.\d+)?)\s*[秒s].*?(\d+(?:\.\d+)?)\s*[秒s]/);
  if (timeMatch)
    return { type: 'cut_segment', params: { startTime: +timeMatch[1], endTime: +timeMatch[2] } };

  if (/静[音默]|停顿|silence/i.test(message))
    return { type: 'remove_silence', params: {} };

  if (/黑屏|black.?screen/i.test(message))
    return { type: 'remove_black_screens', params: {} };

  return null;
}

// ── Intent parsing via function calling ──────────────────────────────────────

async function parseIntent(
  client: OpenAI,
  model: string,
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
): Promise<EditAction | null> {
  try {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 128,
      messages: [
        ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ],
      tools: EDIT_TOOLS,
      tool_choice: 'required',
    });

    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call) return null;

    const args = JSON.parse(call.function.arguments || '{}');
    const name = call.function.name as EditAction['type'];

    switch (name) {
      case 'remove_fillers':
        return { type: 'remove_fillers', params: { customWords: args.customWords } };
      case 'cut_segment':
        return { type: 'cut_segment', params: { startTime: args.startTime, endTime: args.endTime } };
      case 'remove_silence':
        return { type: 'remove_silence', params: { threshold: args.threshold, minDuration: args.minDuration } };
      case 'remove_black_screens':
        return { type: 'remove_black_screens', params: { minDuration: args.minDuration, threshold: args.threshold } };
      default:
        return null;
    }
  } catch (err: any) {
    console.warn('[underlordService] Function calling failed, falling back to keyword parse:', err.message);
    return null;
  }
}

// ── Execute action → cutRegions ──────────────────────────────────────────────

async function executeAction(
  action: EditAction,
  mediaId: string,
  _mediaFilePath?: string,
): Promise<{ startTime: number; endTime: number }[]> {
  switch (action.type) {
    case 'remove_fillers':
      return executeRemoveFillers(mediaId, action.params.customWords);

    case 'cut_segment':
      return executeCutSegment(action.params.startTime, action.params.endTime);

    case 'remove_silence':
      if (!_mediaFilePath) throw new Error('媒体文件路径未知，无法检测静默');
      return executeRemoveSilence(_mediaFilePath, action.params.threshold, action.params.minDuration);

    case 'remove_black_screens':
      if (!_mediaFilePath) throw new Error('媒体文件路径未知，无法检测黑屏');
      return executeRemoveBlackScreens(_mediaFilePath, action.params.minDuration, action.params.threshold);

    default:
      throw new Error('未知操作类型');
  }
}

// ── Main chat function ─────────────────────────────────────────────────────────

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
      { role: 'system', content: SYSTEM_PROMPT },
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

  // 2. Parse intent
  let action: EditAction | null = null;
  if (client) {
    action = await parseIntent(client, model, params.message, params.conversationHistory ?? []);
  }
  if (!action) {
    action = fallbackParse(params.message);
  }

  if (!action) {
    emit({ type: 'done', operationId: '' });
    return;
  }

  // 3. Execute + emit patch
  const label = ACTION_LABELS[action.type];
  emit({ type: 'plan', steps: [label] });

  const startTime = Date.now();
  emit({ type: 'step_start', name: label });

  try {
    const cutRegions = await executeAction(action, params.mediaId, params.mediaFilePath);
    const patch: TimelinePatch = { op: 'remove_segments', segments: cutRegions };
    emit({
      type: 'step_done',
      name: label,
      durationMs: Date.now() - startTime,
      patch,
    });
    emit({ type: 'done', operationId: `op-${++opCounter}` });
  } catch (err: any) {
    emit({ type: 'error', message: err.message || '执行失败' });
  }
}
