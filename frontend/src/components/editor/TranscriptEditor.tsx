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
import { Scissors, RotateCcw, Clock, Plus, User, Check } from 'lucide-react';
import { Word, Speaker } from '@shared/types';

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
    updateTranscript,
  } = useEditorStore();

  // ── Speaker state ──────────────────────────────────────────────
  const [speakerPopoverSegId, setSpeakerPopoverSegId] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const SPEAKER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#F7DC6F', '#FAB1A0', '#74B9FF'];

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSpeakerPopoverSegId(null);
        setIsAddingNew(false);
        setNewSpeakerName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assignSpeaker = useCallback((segmentId: string, speaker: Speaker) => {
    if (!transcript) return;
    updateTranscript({
      ...transcript,
      segments: transcript.segments.map(s =>
        s.id === segmentId ? { ...s, speakerId: speaker.id, speakerName: speaker.customName || speaker.label } : s
      ),
    });
    setSpeakerPopoverSegId(null);
    setIsAddingNew(false);
    setNewSpeakerName('');
  }, [transcript, updateTranscript]);

  const createAndAssign = useCallback((segmentId: string) => {
    const name = newSpeakerName.trim();
    if (!transcript || !name) return;
    const existingCount = (transcript.speakers || []).length;
    const newSpeaker: Speaker = {
      id: `spk-${Date.now()}`,
      label: name,
      customName: name,
      color: SPEAKER_COLORS[existingCount % SPEAKER_COLORS.length],
      firstAppearance: 0,
      totalDuration: 0,
      segmentCount: 1,
    };
    updateTranscript({
      ...transcript,
      speakers: [...(transcript.speakers || []), newSpeaker],
      segments: transcript.segments.map(s =>
        s.id === segmentId ? { ...s, speakerId: newSpeaker.id, speakerName: newSpeaker.customName } : s
      ),
    });
    setSpeakerPopoverSegId(null);
    setIsAddingNew(false);
    setNewSpeakerName('');
  }, [transcript, newSpeakerName, updateTranscript]);

  const removeSpeaker = useCallback((segmentId: string) => {
    if (!transcript) return;
    updateTranscript({
      ...transcript,
      segments: transcript.segments.map(s =>
        s.id === segmentId ? { ...s, speakerId: undefined, speakerName: undefined } : s
      ),
    });
    setSpeakerPopoverSegId(null);
  }, [transcript, updateTranscript]);

  const getSpeaker = useCallback((speakerId?: string): Speaker | undefined => {
    if (!transcript?.speakers || !speakerId) return undefined;
    return transcript.speakers.find(sp => sp.id === speakerId);
  }, [transcript]);

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
        const speaker = getSpeaker(segment.speakerId);
        const isPopoverOpen = speakerPopoverSegId === segment.id;

        return (
          <div key={segment.id} className="group relative">

            {/* ── Speaker label row ── */}
            <div className="flex items-center gap-2 mb-1.5 relative">
              {speaker ? (
                <button
                  onClick={() => {
                    setSpeakerPopoverSegId(isPopoverOpen ? null : segment.id);
                    setIsAddingNew(false);
                    setNewSpeakerName('');
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: speaker.color || '#888' }}
                  />
                  <span style={{ color: speaker.color || '#aaa' }}>
                    {speaker.customName || speaker.label}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSpeakerPopoverSegId(isPopoverOpen ? null : segment.id);
                    setIsAddingNew(false);
                    setNewSpeakerName('');
                  }}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition"
                >
                  <User className="w-3 h-3" />
                  Add speaker
                </button>
              )}

              {/* Speaker popover */}
              {isPopoverOpen && (
                <div
                  ref={popoverRef}
                  className="absolute left-0 top-6 z-30 bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl w-52 overflow-hidden"
                >
                  {/* Existing speakers */}
                  {(transcript.speakers || []).length > 0 && (
                    <div className="py-1 border-b border-[#2a2a2a]">
                      {(transcript.speakers || []).map(sp => (
                        <button
                          key={sp.id}
                          onClick={() => assignSpeaker(segment.id, sp)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#2a2a2a] transition text-left"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: sp.color || '#888' }}
                          />
                          <span className="flex-1 text-xs text-gray-200 truncate">
                            {sp.customName || sp.label}
                          </span>
                          {segment.speakerId === sp.id && (
                            <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Add new speaker */}
                  {isAddingNew ? (
                    <div className="p-2 flex gap-1">
                      <input
                        autoFocus
                        value={newSpeakerName}
                        onChange={e => setNewSpeakerName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') createAndAssign(segment.id);
                          if (e.key === 'Escape') { setIsAddingNew(false); setNewSpeakerName(''); }
                        }}
                        placeholder="Name..."
                        className="flex-1 bg-[#2a2a2a] border border-[#444] rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#7c3aed]/50"
                      />
                      <button
                        onClick={() => createAndAssign(segment.id)}
                        disabled={!newSpeakerName.trim()}
                        className="px-2 py-1 bg-[#7c3aed] text-white rounded text-xs disabled:opacity-40"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAddingNew(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2a2a] transition text-left"
                    >
                      <Plus className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-500">Add new speaker</span>
                    </button>
                  )}

                  {/* Remove speaker (only if assigned) */}
                  {segment.speakerId && (
                    <button
                      onClick={() => removeSpeaker(segment.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2a2a] transition text-left border-t border-[#2a2a2a]"
                    >
                      <span className="text-xs text-red-400/70 hover:text-red-400">Remove speaker</span>
                    </button>
                  )}
                </div>
              )}
            </div>

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

