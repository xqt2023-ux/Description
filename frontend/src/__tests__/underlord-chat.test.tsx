/**
 * TDD tests for InteractiveWorkflowSidebar chat UI.
 *
 * Feature: Underlord sidebar redesigned as a conversational chat interface:
 *   1. User messages shown as right-aligned purple bubbles
 *   2. AI responses shown as left-aligned streaming text
 *   3. Details section (collapsible) showing operation steps + timing
 *   4. Revert button appears after operations complete
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InteractiveWorkflowSidebar } from '@/components/editor/InteractiveWorkflowSidebar';

// ── Mock stores ─────────────────────────────────────────────────────────────

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: () => ({
    mediaFiles: [{ id: 'media-123', name: 'test.mp4', type: 'video', url: '/uploads/test.mp4', duration: 0, size: 0, thumbnails: [] }],
    duration: 180,
  }),
}));

// ── Mock underlordApi ────────────────────────────────────────────────────────

const mockChat = vi.fn();
const mockRevert = vi.fn();

vi.mock('@/lib/api', () => ({
  underlordApi: {
    chat: (...args: any[]) => mockChat(...args),
    revert: (...args: any[]) => mockRevert(...args),
  },
  getUploadUrl: vi.fn((p: string) => p),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake SSE Response from an array of events */
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

function getInput() {
  return screen.getByPlaceholderText(/ask underlord/i);
}

function getSendButton() {
  return screen.getByRole('button', { name: /send/i });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InteractiveWorkflowSidebar — chat UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Ask Underlord input placeholder', () => {
    render(<InteractiveWorkflowSidebar />);
    expect(getInput()).toBeInTheDocument();
  });

  it('shows user message as bubble after sending', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'text', delta: 'OK' },
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '去掉所有字幕' } });
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect(screen.getByText('去掉所有字幕')).toBeInTheDocument();
    });
  });

  it('clears input after sending', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    const input = getInput();
    fireEvent.change(input, { target: { value: '测试消息' } });
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  it('shows streaming AI response text from text events', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'text', delta: '正在处理你的请求...' },
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '去掉字幕' } });
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect(screen.getByText('正在处理你的请求...')).toBeInTheDocument();
    });
  });

  it('shows Revert button after done event with operationId', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'text', delta: '完成了！' },
      { type: 'done', operationId: 'wf-abc' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '去掉字幕' } });
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /revert/i })).toBeInTheDocument();
    });
  });

  it('does NOT show Revert button when operationId is empty', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '你好' } });
    fireEvent.click(getSendButton());

    await waitFor(() => {
      // Wait for done processing
      expect(screen.queryByRole('button', { name: /revert/i })).not.toBeInTheDocument();
    });
  });

  it('calls underlordApi.revert with operationId when Revert clicked', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'done', operationId: 'wf-abc' },
    ]));
    mockRevert.mockResolvedValue({});

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '去掉字幕' } });
    fireEvent.click(getSendButton());

    const revertBtn = await screen.findByRole('button', { name: /revert/i });
    fireEvent.click(revertBtn);

    await waitFor(() => {
      expect(mockRevert).toHaveBeenCalledWith('wf-abc');
    });
  });

  it('shows steps in Details section from plan + step_done events', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'text', delta: '正在执行...' },
      { type: 'plan', steps: ['Remove filler words', 'Trim silences'] },
      { type: 'step_start', name: 'Remove filler words' },
      { type: 'step_done', name: 'Remove filler words', durationMs: 150 },
      { type: 'step_start', name: 'Trim silences' },
      { type: 'step_done', name: 'Trim silences', durationMs: 80 },
      { type: 'done', operationId: 'wf-123' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '去掉嗯啊并裁剪静音' } });
    fireEvent.click(getSendButton());

    // Wait for completion then expand Details
    await waitFor(() => screen.getByRole('button', { name: /revert/i }));

    const detailsToggle = screen.getByText(/details/i);
    fireEvent.click(detailsToggle);

    expect(screen.getByText('Remove filler words')).toBeInTheDocument();
    expect(screen.getByText('Trim silences')).toBeInTheDocument();
  });

  it('calls underlordApi.chat with message and mediaId', async () => {
    mockChat.mockReturnValue(makeSSEResponse([
      { type: 'done', operationId: '' },
    ]));

    render(<InteractiveWorkflowSidebar />);
    fireEvent.change(getInput(), { target: { value: '帮我优化音频' } });
    fireEvent.click(getSendButton());

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '帮我优化音频',
          mediaId: 'media-123',
        })
      );
    });
  });
});
