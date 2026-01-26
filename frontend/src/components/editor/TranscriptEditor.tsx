/**
 * TranscriptEditor Component (T015, T016)
 * 
 * Displays transcript with word-level timestamps.
 * Features:
 * - Click-and-drag word selection for cut operations
 * - Visual indication of deleted (cut) words
 * - Current playback word highlighting
 * - Seek to word on click (when not selecting)
 * - Selection → timeline timestamp mapping
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { Scissors, RotateCcw, Clock } from 'lucide-react';
import { Word } from '@shared/types';

interface SelectionState {
  isSelecting: boolean;
  startSegmentId: string | null;
  startWordIndex: number;
  endSegmentId: string | null;
  endWordIndex: number;
}

export function TranscriptEditor() {
  const {
    transcript,
    currentTime,
    seekTo,
    selectedWords,
    selectWords,
    deleteSelectedWords,
    restoreDeletedWords,
  } = useEditorStore();

  const [selection, setSelection] = useState<SelectionState>({
    isSelecting: false,
    startSegmentId: null,
    startWordIndex: -1,
    endSegmentId: null,
    endWordIndex: -1,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Clear selection on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        selectWords(null);
        setSelection({
          isSelecting: false,
          startSegmentId: null,
          startWordIndex: -1,
          endSegmentId: null,
          endWordIndex: -1,
        });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectWords]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWords) {
          e.preventDefault();
          deleteSelectedWords();
        }
      } else if (e.key === 'Escape') {
        selectWords(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedWords, deleteSelectedWords, selectWords]);

  const handleWordMouseDown = useCallback(
    (segmentId: string, wordIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      setSelection({
        isSelecting: true,
        startSegmentId: segmentId,
        startWordIndex: wordIndex,
        endSegmentId: segmentId,
        endWordIndex: wordIndex,
      });
    },
    []
  );

  const handleWordMouseEnter = useCallback(
    (segmentId: string, wordIndex: number) => {
      if (selection.isSelecting && selection.startSegmentId === segmentId) {
        setSelection((prev) => ({
          ...prev,
          endSegmentId: segmentId,
          endWordIndex: wordIndex,
        }));
      }
    },
    [selection.isSelecting, selection.startSegmentId]
  );

  const handleMouseUp = useCallback(() => {
    if (selection.isSelecting && selection.startSegmentId) {
      const start = Math.min(selection.startWordIndex, selection.endWordIndex);
      const end = Math.max(selection.startWordIndex, selection.endWordIndex);

      selectWords({
        segmentId: selection.startSegmentId,
        startWordIndex: start,
        endWordIndex: end,
      });

      setSelection((prev) => ({
        ...prev,
        isSelecting: false,
      }));
    }
  }, [selection, selectWords]);

  const handleWordClick = useCallback(
    (word: Word) => {
      if (!selection.isSelecting && !selectedWords) {
        seekTo(word.startTime);
      }
    },
    [selection.isSelecting, selectedWords, seekTo]
  );

  const handleCutSelection = useCallback(() => {
    deleteSelectedWords();
  }, [deleteSelectedWords]);

  const handleRestoreSegment = useCallback(
    (segmentId: string) => {
      if (!transcript) return;

      const segment = transcript.segments.find((s) => s.id === segmentId);
      if (!segment) return;

      const deletedIndices = segment.words
        .map((w, i) => (w.deleted ? i : -1))
        .filter((i) => i >= 0);

      if (deletedIndices.length > 0) {
        restoreDeletedWords(segmentId, deletedIndices);
      }
    },
    [transcript, restoreDeletedWords]
  );

  const isWordSelected = useCallback(
    (segmentId: string, wordIndex: number): boolean => {
      // During drag selection
      if (selection.isSelecting && selection.startSegmentId === segmentId) {
        const start = Math.min(selection.startWordIndex, selection.endWordIndex);
        const end = Math.max(selection.startWordIndex, selection.endWordIndex);
        return wordIndex >= start && wordIndex <= end;
      }

      // Committed selection
      if (selectedWords && selectedWords.segmentId === segmentId) {
        return (
          wordIndex >= selectedWords.startWordIndex &&
          wordIndex <= selectedWords.endWordIndex
        );
      }

      return false;
    },
    [selection, selectedWords]
  );

  const getSelectionTimeRange = useCallback((): { start: number; end: number } | null => {
    if (!transcript || !selectedWords) return null;

    const segment = transcript.segments.find(
      (s) => s.id === selectedWords.segmentId
    );
    if (!segment) return null;

    const startWord = segment.words[selectedWords.startWordIndex];
    const endWord = segment.words[selectedWords.endWordIndex];

    if (!startWord || !endWord) return null;

    return {
      start: startWord.startTime,
      end: endWord.endTime,
    };
  }, [transcript, selectedWords]);

  if (!transcript || transcript.segments.length === 0) {
    return (
      <div className="text-center text-editor-muted py-8">
        <p className="mb-2">No transcript available</p>
        <p className="text-sm">
          Upload a video to automatically generate a transcript
        </p>
      </div>
    );
  }

  const timeRange = getSelectionTimeRange();
  const hasDeletedWords = transcript.segments.some((s) =>
    s.words.some((w) => w.deleted)
  );

  return (
    <div ref={containerRef} className="space-y-4" onMouseUp={handleMouseUp}>
      {/* Selection toolbar */}
      {selectedWords && timeRange && (
        <div className="sticky top-0 z-10 bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400">Selected:</span>
            <span className="text-blue-400 flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatTime(timeRange.start)} - {formatTime(timeRange.end)}
            </span>
            <span className="text-gray-500">
              ({(timeRange.end - timeRange.start).toFixed(2)}s)
            </span>
          </div>
          <button
            onClick={handleCutSelection}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition"
          >
            <Scissors className="w-4 h-4" />
            Cut Selection
          </button>
        </div>
      )}

      {/* Segments */}
      {transcript.segments.map((segment) => {
        const hasDeleted = segment.words.some((w) => w.deleted);

        return (
          <div key={segment.id} className="group relative">
            {/* Speaker label */}
            {segment.speakerId && (
              <div className="text-xs text-primary-400 mb-1 font-medium">
                Speaker {segment.speakerId}
              </div>
            )}

            {/* Restore button for segment with deleted words */}
            {hasDeleted && (
              <button
                onClick={() => handleRestoreSegment(segment.id)}
                className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition"
                title="Restore deleted words"
              >
                <RotateCcw className="w-3 h-3" />
                Restore
              </button>
            )}

            {/* Words */}
            <p className="leading-relaxed select-none">
              {segment.words.map((word, wordIndex) => {
                const isActive =
                  currentTime >= word.startTime && currentTime < word.endTime;
                const isSelected = isWordSelected(segment.id, wordIndex);
                const isDeleted = word.deleted;

                return (
                  <span
                    key={`${segment.id}-${wordIndex}`}
                    className={`
                      transcript-word cursor-pointer transition-all duration-100
                      ${isActive ? 'active bg-yellow-500/30' : ''}
                      ${isSelected ? 'bg-blue-500/40 text-white' : ''}
                      ${isDeleted ? 'line-through opacity-40 text-red-400' : ''}
                      ${!isDeleted && !isSelected && !isActive ? 'hover:bg-gray-700/50' : ''}
                    `}
                    onMouseDown={(e) =>
                      !isDeleted && handleWordMouseDown(segment.id, wordIndex, e)
                    }
                    onMouseEnter={() =>
                      !isDeleted && handleWordMouseEnter(segment.id, wordIndex)
                    }
                    onClick={() => !isDeleted && handleWordClick(word)}
                    title={
                      isDeleted
                        ? 'Deleted'
                        : `${formatTime(word.startTime)} - ${formatTime(word.endTime)}`
                    }
                  >
                    {word.text}{' '}
                  </span>
                );
              })}
            </p>

            {/* Timestamp */}
            <div className="text-xs text-editor-muted mt-1 opacity-0 group-hover:opacity-100 transition">
              {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
            </div>
          </div>
        );
      })}

      {/* Hint when has deleted words */}
      {hasDeletedWords && (
        <div className="text-xs text-gray-500 text-center py-2 border-t border-gray-800">
          Strikethrough text has been cut and will be removed from the final
          export
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

