/**
 * TDD tests for InteractiveWorkflowSidebar auto-execute behavior.
 *
 * Feature: When the editor dispatches 'auto-edit-request' window event after
 * transcription completes, the sidebar should:
 *   1. Create a workflow with the user's request
 *   2. Auto-execute all steps without user interaction
 *   3. Show real-time progress
 *   4. Display an error if transcription failed
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

// ── Mock workflowApi ───────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockExecuteStep = vi.fn();
const mockConfirmStep = vi.fn();

vi.mock('@/lib/api', () => ({
  workflowApi: {
    create: (...args: any[]) => mockCreate(...args),
    executeStep: (...args: any[]) => mockExecuteStep(...args),
    confirmStep: (...args: any[]) => mockConfirmStep(...args),
    undo: vi.fn(),
    cancel: vi.fn(),
  },
  getUploadUrl: vi.fn((p: string) => p),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeWorkflowResponse(steps: { id: string; type: string; description: string }[]) {
  return {
    data: {
      data: {
        workflowId: 'wf-001',
        steps,
      },
    },
  };
}

function makeExecResponse(content: string) {
  return {
    data: {
      data: {
        preview: { content },
      },
    },
  };
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

  it('calls workflowApi.create with user request when event fires', async () => {
    mockCreate.mockResolvedValue(makeWorkflowResponse([
      { id: 'step-1', type: 'remove_fillers', description: 'Remove filler words' },
    ]));
    mockExecuteStep.mockResolvedValue(makeExecResponse('Removed 23 fillers'));
    mockConfirmStep.mockResolvedValue({});

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉所有嗯啊停顿');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        '去掉所有嗯啊停顿',
        'media-test-123',
        expect.objectContaining({ duration: 180 })
      );
    });
  });

  it('auto-executes all steps without user clicking Execute button', async () => {
    mockCreate.mockResolvedValue(makeWorkflowResponse([
      { id: 'step-1', type: 'remove_fillers', description: 'Remove filler words' },
      { id: 'step-2', type: 'trim', description: 'Remove silences' },
    ]));
    mockExecuteStep.mockResolvedValue(makeExecResponse('Done'));
    mockConfirmStep.mockResolvedValue({});

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉嗯啊并剪掉停顿');

    await waitFor(() => {
      expect(mockExecuteStep).toHaveBeenCalledTimes(2);
    });
    expect(mockConfirmStep).toHaveBeenCalledTimes(2);
  });

  it('shows step descriptions while executing', async () => {
    mockCreate.mockResolvedValue(makeWorkflowResponse([
      { id: 'step-1', type: 'remove_fillers', description: 'Remove filler words' },
    ]));
    // Make executeStep slow enough to catch the in-progress state
    mockExecuteStep.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(makeExecResponse('Done')), 50))
    );
    mockConfirmStep.mockResolvedValue({});

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉嗯啊');

    await waitFor(() => {
      expect(screen.getByText('Remove filler words')).toBeInTheDocument();
    });
  });

  it('shows completion state after all steps finish', async () => {
    mockCreate.mockResolvedValue(makeWorkflowResponse([
      { id: 'step-1', type: 'remove_fillers', description: 'Remove filler words' },
    ]));
    mockExecuteStep.mockResolvedValue(makeExecResponse('Removed 12 fillers'));
    mockConfirmStep.mockResolvedValue({});

    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit('去掉嗯啊');

    // Wait for result summary — confirms runSteps completed
    await waitFor(
      () => expect(screen.getByText('Removed 12 fillers')).toBeInTheDocument(),
      { timeout: 3000 }
    );
    // Phase is now 'done' — "New edit" button visible
    expect(screen.getByRole('button', { name: /new edit/i })).toBeInTheDocument();
  });

  it('shows error message when transcription failed', async () => {
    render(<InteractiveWorkflowSidebar />);
    dispatchAutoEdit(null, true /* failed */);

    await waitFor(() => {
      expect(screen.getByText(/transcription failed/i)).toBeInTheDocument();
    });
    // workflowApi.create should NOT have been called
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not call workflowApi.create when request is null', async () => {
    // Guard: event handler checks `if (request && mediaId)` — null request skipped
    render(<InteractiveWorkflowSidebar />);
    window.dispatchEvent(
      new CustomEvent('auto-edit-request', { detail: { request: null, failed: false } })
    );
    await new Promise(r => setTimeout(r, 50));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
