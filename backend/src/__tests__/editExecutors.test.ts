/**
 * TDD tests for editExecutors.ts
 *
 * Feature: remove_fillers executor scans transcript words and returns
 * cutRegions for filler words, with adjacent-region merging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock getStoredTranscript ────────────────────────────────────────────────

vi.mock('../services/dubbing', () => ({
  getStoredTranscript: vi.fn(),
}));

import { getStoredTranscript } from '../services/dubbing';
import { executeRemoveFillers } from '../services/editExecutors';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTranscript(words: { text: string; startTime: number; endTime: number }[]) {
  return {
    text: words.map(w => w.text).join(' '),
    segments: [
      {
        text: words.map(w => w.text).join(' '),
        startTime: words[0]?.startTime ?? 0,
        endTime: words[words.length - 1]?.endTime ?? 0,
        words: words.map(w => ({ ...w, confidence: 0.9 })),
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('executeRemoveFillers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no transcript is stored', async () => {
    (getStoredTranscript as any).mockReturnValue(null);
    await expect(executeRemoveFillers('media-1')).rejects.toThrow('请先转录视频');
  });

  it('returns empty array when no filler words found', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: '今天', startTime: 0, endTime: 0.5 },
      { text: '天气', startTime: 0.6, endTime: 1.0 },
      { text: '很好', startTime: 1.1, endTime: 1.6 },
    ]));

    const result = await executeRemoveFillers('media-1');
    expect(result).toEqual([]);
  });

  it('returns cutRegions for Chinese filler words', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: '嗯', startTime: 0.0, endTime: 0.3 },
      { text: '我', startTime: 0.5, endTime: 0.8 },
      { text: '啊', startTime: 1.0, endTime: 1.2 },
      { text: '觉得', startTime: 1.5, endTime: 1.9 },
    ]));

    const result = await executeRemoveFillers('media-1');
    expect(result).toEqual([
      { startTime: 0.0, endTime: 0.3 },
      { startTime: 1.0, endTime: 1.2 },
    ]);
  });

  it('returns cutRegions for English filler words', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: 'um', startTime: 0.0, endTime: 0.2 },
      { text: 'I', startTime: 0.3, endTime: 0.4 },
      { text: 'uh', startTime: 0.5, endTime: 0.7 },
      { text: 'think', startTime: 0.8, endTime: 1.1 },
    ]));

    const result = await executeRemoveFillers('media-1');
    expect(result).toEqual([
      { startTime: 0.0, endTime: 0.2 },
      { startTime: 0.5, endTime: 0.7 },
    ]);
  });

  it('merges adjacent filler regions separated by less than 0.1s', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: '嗯', startTime: 0.0, endTime: 0.3 },
      { text: '啊', startTime: 0.35, endTime: 0.6 },  // gap = 0.05s → merge
      { text: '好', startTime: 1.0, endTime: 1.3 },
    ]));

    const result = await executeRemoveFillers('media-1');
    expect(result).toEqual([
      { startTime: 0.0, endTime: 0.6 },  // merged
    ]);
  });

  it('does NOT merge regions separated by more than 0.1s', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: '嗯', startTime: 0.0, endTime: 0.3 },
      { text: '那个', startTime: 0.5, endTime: 0.9 },  // gap = 0.2s → keep separate
    ]));

    const result = await executeRemoveFillers('media-1');
    expect(result).toEqual([
      { startTime: 0.0, endTime: 0.3 },
      { startTime: 0.5, endTime: 0.9 },
    ]);
  });

  it('includes custom words specified by caller', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: '反正', startTime: 0.0, endTime: 0.4 },
      { text: '我', startTime: 0.6, endTime: 0.8 },
    ]));

    const result = await executeRemoveFillers('media-1', ['反正']);
    expect(result).toEqual([
      { startTime: 0.0, endTime: 0.4 },
    ]);
  });

  it('is case-insensitive for English fillers', async () => {
    (getStoredTranscript as any).mockReturnValue(makeTranscript([
      { text: 'Um', startTime: 0.0, endTime: 0.2 },
      { text: 'Like', startTime: 0.3, endTime: 0.5 },
    ]));

    const result = await executeRemoveFillers('media-1');
    expect(result).toEqual([
      { startTime: 0.0, endTime: 0.2 },
      { startTime: 0.3, endTime: 0.5 },
    ]);
  });
});
