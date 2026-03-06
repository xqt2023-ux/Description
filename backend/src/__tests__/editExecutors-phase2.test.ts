/**
 * TDD tests for Phase 2 executors:
 * - parseSilenceOutput: parses FFmpeg silencedetect stderr
 * - parseBlackDetectOutput: parses FFmpeg blackdetect stderr
 * - executeRemoveSilence: runs FFmpeg + parses (FFmpeg runner mocked)
 * - executeRemoveBlackScreens: runs FFmpeg + parses (FFmpeg runner mocked)
 * - executeCutSegment: returns a single cutRegion directly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock child_process for FFmpeg ──────────────────────────────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import {
  parseSilenceOutput,
  parseBlackDetectOutput,
  executeCutSegment,
  executeRemoveSilence,
  executeRemoveBlackScreens,
} from '../services/editExecutors';

// ── parseSilenceOutput ─────────────────────────────────────────────────────

describe('parseSilenceOutput', () => {
  it('returns empty array for empty input', () => {
    expect(parseSilenceOutput('')).toEqual([]);
  });

  it('parses a single silence region', () => {
    const stderr = [
      '[silencedetect @ 0x55f] silence_start: 1.234',
      '[silencedetect @ 0x55f] silence_end: 2.567 | silence_duration: 1.333',
    ].join('\n');

    expect(parseSilenceOutput(stderr)).toEqual([
      { startTime: 1.234, endTime: 2.567 },
    ]);
  });

  it('parses multiple silence regions', () => {
    const stderr = [
      '[silencedetect @ 0x55f] silence_start: 0.5',
      '[silencedetect @ 0x55f] silence_end: 1.0 | silence_duration: 0.5',
      '[silencedetect @ 0x55f] silence_start: 5.0',
      '[silencedetect @ 0x55f] silence_end: 6.5 | silence_duration: 1.5',
    ].join('\n');

    expect(parseSilenceOutput(stderr)).toEqual([
      { startTime: 0.5, endTime: 1.0 },
      { startTime: 5.0, endTime: 6.5 },
    ]);
  });

  it('ignores lines that are not silence events', () => {
    const stderr = [
      'ffmpeg version 6.0',
      'Input #0, mov,mp4,m4a',
      '[silencedetect @ 0x55f] silence_start: 2.0',
      '[silencedetect @ 0x55f] silence_end: 3.0 | silence_duration: 1.0',
      'video: 1280x720',
    ].join('\n');

    expect(parseSilenceOutput(stderr)).toEqual([
      { startTime: 2.0, endTime: 3.0 },
    ]);
  });

  it('handles silence_start without matching silence_end gracefully', () => {
    const stderr = '[silencedetect @ 0x55f] silence_start: 10.0';
    // no end → should not return incomplete region
    expect(parseSilenceOutput(stderr)).toEqual([]);
  });
});

// ── parseBlackDetectOutput ─────────────────────────────────────────────────

describe('parseBlackDetectOutput', () => {
  it('returns empty array for empty input', () => {
    expect(parseBlackDetectOutput('')).toEqual([]);
  });

  it('parses a single black screen region', () => {
    const stderr = '[blackdetect @ 0x55f] black_start:0.0 black_end:0.5 black_duration:0.5';

    expect(parseBlackDetectOutput(stderr)).toEqual([
      { startTime: 0.0, endTime: 0.5 },
    ]);
  });

  it('parses multiple black screen regions', () => {
    const stderr = [
      '[blackdetect @ 0x55f] black_start:0.0 black_end:0.5 black_duration:0.5',
      '[blackdetect @ 0x55f] black_start:10.2 black_end:11.3 black_duration:1.1',
    ].join('\n');

    expect(parseBlackDetectOutput(stderr)).toEqual([
      { startTime: 0.0,  endTime: 0.5 },
      { startTime: 10.2, endTime: 11.3 },
    ]);
  });

  it('ignores non-blackdetect lines', () => {
    const stderr = [
      'ffmpeg version 6.0',
      '[blackdetect @ 0x55f] black_start:3.0 black_end:4.0 black_duration:1.0',
      'frame=100',
    ].join('\n');

    expect(parseBlackDetectOutput(stderr)).toEqual([
      { startTime: 3.0, endTime: 4.0 },
    ]);
  });
});

// ── executeCutSegment ──────────────────────────────────────────────────────

describe('executeCutSegment', () => {
  it('returns a single region from startTime/endTime params', async () => {
    const result = await executeCutSegment(5.0, 10.0);
    expect(result).toEqual([{ startTime: 5.0, endTime: 10.0 }]);
  });

  it('works with fractional seconds', async () => {
    const result = await executeCutSegment(1.234, 5.678);
    expect(result).toEqual([{ startTime: 1.234, endTime: 5.678 }]);
  });
});

// ── executeRemoveSilence (mocked FFmpeg) ───────────────────────────────────

describe('executeRemoveSilence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cutRegions from FFmpeg silencedetect output', async () => {
    const { spawn } = await import('child_process');
    (spawn as any).mockImplementation(() => ({
      stderr: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from([
              '[silencedetect @ 0x55f] silence_start: 1.0',
              '[silencedetect @ 0x55f] silence_end: 2.0 | silence_duration: 1.0',
            ].join('\n')));
          }
        },
      },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0);
      },
    }));

    const result = await executeRemoveSilence('/path/to/video.mp4');
    expect(result).toEqual([{ startTime: 1.0, endTime: 2.0 }]);
  });

  it('returns empty array when no silence detected', async () => {
    const { spawn } = await import('child_process');
    (spawn as any).mockImplementation(() => ({
      stderr: { on: () => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0);
      },
    }));

    const result = await executeRemoveSilence('/path/to/video.mp4');
    expect(result).toEqual([]);
  });
});

// ── executeRemoveBlackScreens (mocked FFmpeg) ──────────────────────────────

describe('executeRemoveBlackScreens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cutRegions from FFmpeg blackdetect output', async () => {
    const { spawn } = await import('child_process');
    (spawn as any).mockImplementation(() => ({
      stderr: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('[blackdetect @ 0x55f] black_start:0.0 black_end:1.5 black_duration:1.5'));
          }
        },
      },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0);
      },
    }));

    const result = await executeRemoveBlackScreens('/path/to/video.mp4');
    expect(result).toEqual([{ startTime: 0.0, endTime: 1.5 }]);
  });
});
