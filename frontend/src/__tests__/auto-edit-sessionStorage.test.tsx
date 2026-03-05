/**
 * TDD tests for auto-edit sessionStorage behavior.
 *
 * Feature: When the user types editing requirements on the homepage and clicks
 * "Get started", the text is saved to sessionStorage.pendingAutoEdit so the
 * editor can pick it up after transcription completes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HomePage from '@/app/page';

// ── Mocks required for HomePage to render ──────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => ({
  mediaApi: {
    upload: vi.fn(),
    getAll: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    getById: vi.fn(),
    validate: vi.fn(),
  },
  aiApi: {
    planTasks: vi.fn().mockResolvedValue({ data: { success: true, data: { tasks: [] } } }),
    orchestrateEdit: vi.fn(),
    executePlan: vi.fn(),
  },
  transcriptionApi: { startJob: vi.fn(), getJobStatus: vi.fn() },
  workflowApi: { create: vi.fn(), executeStep: vi.fn(), confirmStep: vi.fn() },
  downloadEditedVideo: vi.fn(() => '/api/export/download/edited.mp4'),
  getUploadUrl: vi.fn((p: string) => `http://localhost:4001${p}`),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

/** Find the hidden file input and simulate a file selection. */
function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function getStartedButton() {
  return screen.getByRole('button', { name: /get started/i });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Auto-edit sessionStorage — handleGetStarted', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('saves promptText to sessionStorage when text is present', () => {
    render(<HomePage />);

    const textarea = screen.getByPlaceholderText(/描述你想制作的内容/i);
    fireEvent.change(textarea, { target: { value: '去掉所有嗯啊停顿' } });

    fireEvent.click(getStartedButton());

    expect(sessionStorage.getItem('pendingAutoEdit')).toBe('去掉所有嗯啊停顿');
  });

  it('clears sessionStorage when promptText is empty', () => {
    sessionStorage.setItem('pendingAutoEdit', 'stale value from previous session');

    render(<HomePage />);
    // textarea is empty (default state)
    fireEvent.click(getStartedButton());

    expect(sessionStorage.getItem('pendingAutoEdit')).toBeNull();
  });

  it('trims whitespace before saving to sessionStorage', () => {
    render(<HomePage />);

    const textarea = screen.getByPlaceholderText(/描述你想制作的内容/i);
    fireEvent.change(textarea, { target: { value: '  去掉背景噪音  ' } });
    fireEvent.click(getStartedButton());

    expect(sessionStorage.getItem('pendingAutoEdit')).toBe('去掉背景噪音');
  });

  it('does not save whitespace-only text to sessionStorage', () => {
    render(<HomePage />);

    const textarea = screen.getByPlaceholderText(/描述你想制作的内容/i);
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(getStartedButton());

    expect(sessionStorage.getItem('pendingAutoEdit')).toBeNull();
  });

  it('saves editing request even when no file is selected', () => {
    render(<HomePage />);

    const textarea = screen.getByPlaceholderText(/描述你想制作的内容/i);
    fireEvent.change(textarea, { target: { value: '帮我翻译成英文' } });
    fireEvent.click(getStartedButton());

    expect(sessionStorage.getItem('pendingAutoEdit')).toBe('帮我翻译成英文');
  });
});
