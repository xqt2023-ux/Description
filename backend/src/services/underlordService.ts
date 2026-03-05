/**
 * Underlord Service
 *
 * Two-layer architecture:
 * 1. Claude API (streaming) — generates conversational response
 * 2. interactiveEditWorkflow — executes the actual operations
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  createInteractiveWorkflow,
  executeWorkflowStep,
  confirmStep,
} from './interactiveEditWorkflow';
import { MediaInfo } from './videoEditOrchestration';

// ── Event protocol ─────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'text'; delta: string }
  | { type: 'plan'; steps: string[] }
  | { type: 'step_start'; name: string }
  | { type: 'step_done'; name: string; durationMs: number }
  | { type: 'done'; operationId: string }
  | { type: 'error'; message: string };

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Underlord, an AI assistant inside a professional video editor.
When the user asks you to edit their video, respond conversationally in 1-2 sentences explaining what you are about to do.
Respond in the same language the user uses (Chinese or English).
Be concise and confident. Do NOT list the individual steps — just briefly describe the edit.`;

// ── Main chat function ─────────────────────────────────────────────────────────

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
  // 1. Stream Claude's conversational response
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // No API key: emit a short simulated response
    emit({ type: 'text', delta: '好的，我来帮你处理这个请求...' });
  } else {
    const client = new Anthropic({ apiKey });
    const messages = [
      ...(params.conversationHistory || []),
      { role: 'user' as const, content: params.message },
    ];

    try {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages,
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          emit({ type: 'text', delta: chunk.delta.text });
        }
      }
    } catch (err: any) {
      // Claude call failed — emit a fallback message and continue to workflow
      emit({ type: 'text', delta: '正在处理你的请求...' });
      console.error('[underlordService] Claude stream error:', err.message);
    }
  }

  // 2. Create and execute workflow
  try {
    const workflow = await createInteractiveWorkflow(
      params.message,
      params.mediaId,
      params.mediaInfo as MediaInfo,
      params.mediaFilePath
    );

    const stepNames = workflow.steps.map(s => s.description);
    emit({ type: 'plan', steps: stepNames });

    for (const step of workflow.steps) {
      const startTime = Date.now();
      emit({ type: 'step_start', name: step.description });

      try {
        await executeWorkflowStep(workflow.id, step.id);
        await confirmStep(workflow.id, step.id, true);
        emit({ type: 'step_done', name: step.description, durationMs: Date.now() - startTime });
      } catch (stepErr: any) {
        emit({ type: 'step_done', name: step.description, durationMs: Date.now() - startTime });
        console.error(`[underlordService] Step "${step.description}" failed:`, stepErr.message);
      }
    }

    emit({ type: 'done', operationId: workflow.id });
  } catch (err: any) {
    emit({ type: 'error', message: err.message || 'Failed to execute workflow' });
  }
}
