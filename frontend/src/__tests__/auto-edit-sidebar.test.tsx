/**
 * TDD tests for InteractiveWorkflowSidebar auto-execute behavior.
 *
 * Feature: When the editor dispatches 'auto-edit-request' window event after
 * transcription completes, the sidebar (now a chat UI) should:
 *   1. Call underlordApi.chat with the user's request
 *   2. Show the request as a user bubble
 *   3. Show an error message if transcription failed
 *   4. Do nothing if request is null
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InteractiveWorkflowSidebar } from '@/components/editor/InteractiveWorkflowSidebar';

// ── Mock stores ────────────────────────────────────────────────────────────

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: () => ({
    mediaFiles: [{ id: 'media-test-123', name: 'test.mp4', type: 'video', url: '/uploads/test.mp4', duration: 0, size: 0, thumbnails: [] }],
    duration: 180,
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

// ── Helpers ────────────────────────────────────────────────────────────────

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

function dispatchAutoEdit(request: string | null, failed = false) {
  window.dispatchEvent(
    new CustomEvent('auto-edit-request', { detail: { request, failed } })
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('InteractiveWorkflowSidebar — auto-edit-request event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls underlordApi.chat with user request when event fires', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'done', operationId: 'wf-001' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉所有嗯啊停顿');

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '去掉所有嗯啊停顿',
          mediaId: 'media-test-123',
        })
      );
    });
  });

  it('shows user request as a bubble in the chat', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉嗯啊并剪掉停顿');

    await waitFor(() => {
      expect(screen.getByText('去掉嗯啊并剪掉停顿')).toBeInTheDocument();
    });
  });

  it('shows error message when transcription failed', async () => {
    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit(null, true /* failed */);

    await waitFor(() => {
      expect(screen.getByText(/transcription failed/i)).toBeInTheDocument();
    });
    // underlordApi.chat should NOT have been called
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('does not call underlordApi.chat when request is null', async () => {
    render(<InteractiveWorkflowSidebar />);
    window.dispatchEvent(
      new CustomEvent('auto-edit-request', { detail: { request: null, failed: false } })
    );
    await new Promise(r => setTimeout(r, 50));
    expect(mockChat).not.toHaveBeenCalled();
  });
});
