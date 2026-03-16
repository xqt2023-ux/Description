/**
 * TDD tests for editorStore.applyPatch
 *
 * Feature: Timeline Patch protocol — when Underlord completes a step,
 * the store applies a TimelinePatch to mark affected words as deleted,
 * which the VideoPlayer auto-picks up via existing cut-region logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';
import { Transcript } from '@shared/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTranscript(): Transcript {
  return {
    id: 'tr-1',
    mediaId: 'm-1',
    language: 'zh',
    createdAt: '',
    updatedAt: '',
    segments: [
      {
        id: 'seg-1',
        text: '嗯 hello 啊 world ok',
        startTime: 0,
        endTime: 5,
        words: [
          { text: '嗯',    startTime: 0.0, endTime: 0.5,  confidence: 1 }, // filler
          { text: 'hello', startTime: 1.0, endTime: 1.5,  confidence: 1 }, // keep
          { text: '啊',    startTime: 2.0, endTime: 2.5,  confidence: 1 }, // filler
          { text: 'world', startTime: 3.0, endTime: 3.5,  confidence: 1 }, // keep
          { text: 'ok',    startTime: 4.0, endTime: 4.5,  confidence: 1 }, // keep
        ],
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('editorStore.applyPatch — remove_segments', () => {
  beforeEach(() => {
    useEditorStore.setState({
      transcript: null,
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
      isDirty: false,
    });
  });

  it('marks words whose time range falls within a cut segment as deleted', () => {
    useEditorStore.setState({ transcript: makeTranscript() });

    useEditorStore.getState().applyPatch({
      op: 'remove_segments',
      segments: [
        { startTime: 0.0, endTime: 0.5 }, // 嗯
        { startTime: 2.0, endTime: 2.5 }, // 啊
      ],
    });

    const words = useEditorStore.getState().transcript!.segments[0].words;
    expect(words[0].deleted).toBe(true);    // 嗯  — cut
    expect(words[1].deleted).toBeFalsy();   // hello — kept
    expect(words[2].deleted).toBe(true);    // 啊  — cut
    expect(words[3].deleted).toBeFalsy();   // world — kept
    expect(words[4].deleted).toBeFalsy();   // ok — kept
  });

  it('handles a single contiguous cut region', () => {
    useEditorStore.setState({ transcript: makeTranscript() });

    useEditorStore.getState().applyPatch({
      op: 'remove_segments',
      segments: [{ startTime: 1.0, endTime: 3.5 }], // hello + 啊 + world
    });

    const words = useEditorStore.getState().transcript!.segments[0].words;
    expect(words[0].deleted).toBeFalsy();  // 嗯   — outside cut
    expect(words[1].deleted).toBe(true);   // hello — inside
    expect(words[2].deleted).toBe(true);   // 啊    — inside
    expect(words[3].deleted).toBe(true);   // world — inside
    expect(words[4].deleted).toBeFalsy();  // ok    — outside cut
  });

  it('does nothing when transcript is null', () => {
    useEditorStore.setState({ transcript: null });

    expect(() =>
      useEditorStore.getState().applyPatch({
        op: 'remove_segments',
        segments: [{ startTime: 0, endTime: 1 }],
      })
    ).not.toThrow();
  });

  it('pushes history before modifying transcript', () => {
    useEditorStore.setState({ transcript: makeTranscript() });
    const before = useEditorStore.getState().historyIndex;

    useEditorStore.getState().applyPatch({
      op: 'remove_segments',
      segments: [{ startTime: 0.0, endTime: 0.5 }],
    });

    expect(useEditorStore.getState().historyIndex).toBeGreaterThan(before);
  });

  it('marks isDirty after applying patch', () => {
    useEditorStore.setState({ transcript: makeTranscript(), isDirty: false });

    useEditorStore.getState().applyPatch({
      op: 'remove_segments',
      segments: [{ startTime: 0.0, endTime: 0.5 }],
    });

    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('is a no-op for unknown patch ops (does not throw)', () => {
    useEditorStore.setState({ transcript: makeTranscript() });

    expect(() =>
      useEditorStore.getState().applyPatch({ op: 'add_transition' as any, afterClipId: 'x', transition: {} as any })
    ).not.toThrow();
  });
});
