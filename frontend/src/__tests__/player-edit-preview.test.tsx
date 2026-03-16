/**
 * TDD tests for player edit preview via SSE patch.
 *
 * Feature: When Underlord's step_done SSE event carries a patch field,
 * the sidebar calls editorStore.applyPatch so the VideoPlayer immediately
 * reflects the edit (cut markers, skipped regions, adjusted duration).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { InteractiveWorkflowSidebar } from '@/components/editor/InteractiveWorkflowSidebar';

// ── Mock stores ────────────────────────────────────────────────────────────

const mockApplyPatch = vi.fn();

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: () => ({
    mediaFiles: [{ id: 'media-001', name: 'test.mp4', type: 'video', url: '/uploads/test.mp4', duration: 0, size: 0, thumbnails: [] }],
    duration: 180,
    applyPatch: mockApplyPatch,
  }),
}));

// ── Mock underlordApi ──────────────────────────────────────────────────────

const mockChat = vi.fn();
const mockRevert = vi.fn();

vi.mock('@/lib/api', () => ({
  underlordApi: {
    chat: (...args: any[]) => mockChat(...args),
    revert: (...args: any[]) => mockRevert(...args),
  },
  getUploadUrl: vi.fn((p: string) => p),
}));

// ── SSE helpers ────────────────────────────────────────────────────────────

function makeSSEResponse(events: object[]) {
  const lines = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines));
      controller.close();
    },
  });
  return Promise.resolve(new Response(stream));
}

function dispatchAutoEdit(request: string) {
  window.dispatchEvent(new CustomEvent('auto-edit-request', { detail: { request, failed: false } }));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('InteractiveWorkflowSidebar — step_done patch → player update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls applyPatch when step_done carries a remove_segments patch', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'plan', steps: ['Remove filler words'] },
      { type: 'step_start', name: 'Remove filler words' },
      {
        type: 'step_done',
        name: 'Remove filler words',
        durationMs: 120,
        patch: {
          op: 'remove_segments',
          segments: [
            { startTime: 2.3, endTime: 2.8 },
            { startTime: 15.1, endTime: 15.6 },
          ],
        },
      },
      { type: 'done', operationId: 'wf-001' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉所有嗯啊');

    await waitFor(() => {
      expect(mockApplyPatch).toHaveBeenCalledWith({
        op: 'remove_segments',
        segments: [
          { startTime: 2.3, endTime: 2.8 },
          { startTime: 15.1, endTime: 15.6 },
        ],
      });
    });
  });

  it('does NOT call applyPatch when step_done has no patch field', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'step_done', name: 'Translate', durationMs: 50 },
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('翻译成英文');

    await waitFor(() => {
      // Wait for the SSE to finish
      expect(mockChat).toHaveBeenCalled();
    });
    await new Promise(r => setTimeout(r, 50));

    expect(mockApplyPatch).not.toHaveBeenCalled();
  });

  it('calls applyPatch once per step_done with a patch', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      {
        type: 'step_done',
        name: 'Cut A',
        durationMs: 10,
        patch: { op: 'remove_segments', segments: [{ startTime: 1, endTime: 2 }] },
      },
      {
        type: 'step_done',
        name: 'Cut B',
        durationMs: 10,
        patch: { op: 'remove_segments', segments: [{ startTime: 5, endTime: 6 }] },
      },
      { type: 'done', operationId: 'wf-multi' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('做两个剪切');

    await waitFor(() => {
      expect(mockApplyPatch).toHaveBeenCalledTimes(2);
    });
    expect(mockApplyPatch).toHaveBeenNthCalledWith(1, {
      op: 'remove_segments', segments: [{ startTime: 1, endTime: 2 }],
    });
    expect(mockApplyPatch).toHaveBeenNthCalledWith(2, {
      op: 'remove_segments', segments: [{ startTime: 5, endTime: 6 }],
    });
  });
});
