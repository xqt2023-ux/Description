/**
 * Editor Store (T008)
 * 
 * Zustand store for project/timeline state management
 * Supports:
 * - Full project state (from API)
 * - Timeline manipulation
 * - Text-driven editing via Word.deleted flag
 * - Undo/redo history
 * - Auto-save coordination
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Project, 
  Transcript, 
  TranscriptSegment,
  Word,
  Track, 
  Clip,
  MediaFile, 
  Timeline 
} from '@shared/types';

interface TranscriptionStatus {
  id: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

interface SelectionRange {
  segmentId: string;
  startWordIndex: number;
  endWordIndex: number;
}

interface HistoryEntry {
  transcript: Transcript | null;
  timeline: Timeline | null;
}

interface EditorState {
  // Project
  projectId: string | null;
  projectName: string;
  project: Project | null;
  isDirty: boolean; // Has unsaved changes
  lastSavedAt: string | null;

  // Video
  videoUrl: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekVersion: number;

  // Transcript
  transcript: Transcript | null;
  transcriptionStatus: TranscriptionStatus;
  selectedWords: SelectionRange | null;

  // Timeline
  tracks: Track[];
  timeline: Timeline | null;
  playheadPosition: number;

  // Media Library
  mediaFiles: MediaFile[];

  // History (for undo/redo)
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // Actions - Project
  setProject: (project: Project) => void;
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  markDirty: () => void;
  markSaved: () => void;

  // Actions - Video
  setVideoUrl: (url: string | null) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setVolume: (volume: number) => void;
  setIsMuted: (isMuted: boolean) => void;
  seekTo: (time: number) => void;

  // Actions - Transcript
  setTranscript: (transcript: Transcript | null) => void;
  setTranscriptionStatus: (status: TranscriptionStatus) => void;
  updateTranscript: (transcript: Transcript) => void;
  selectWords: (selection: SelectionRange | null) => void;
  
  // Actions - Text-driven editing (T017 preview)
  deleteSelectedWords: () => void;
  restoreDeletedWords: (segmentId: string, wordIndices: number[]) => void;
  cutSelection: () => void;

  // Actions - Timeline
  setTimeline: (timeline: Timeline) => void;
  setPlayheadPosition: (position: number) => void;
  addTrack: (track: Track) => void;
  updateTrack: (id: string, track: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  splitClipAtPlayhead: (trackId: string, clipId: string) => void;

  // Actions - Media
  addMediaFile: (file: MediaFile) => void;
  removeMediaFile: (id: string) => void;
  updateMediaThumbnails: (id: string, thumbnails: string[]) => void;
  updateClipThumbnails: (mediaId: string, thumbnails: string[]) => void;

  // Actions - History
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  // Actions - Reset
  reset: () => void;
}

const initialState = {
  projectId: null,
  projectName: 'Untitled Project',
  project: null,
  isDirty: false,
  lastSavedAt: null,
  videoUrl: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  volume: 1,
  isMuted: false,
  seekVersion: 0,
  transcript: null,
  transcriptionStatus: { id: '', status: 'idle' as const, progress: 0 },
  selectedWords: null,
  tracks: [],
  timeline: null,
  playheadPosition: 0,
  mediaFiles: [],
  history: [] as HistoryEntry[],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,
};

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========== Project Actions ==========
    
    setProject: (project) => set({
      project,
      projectId: project.id,
      projectName: project.name,
      transcript: project.transcript,
      timeline: project.timeline,
      tracks: project.timeline?.tracks || [],
      mediaFiles: project.media.map(m => ({
        id: m.id,
        name: m.originalName,
        type: m.type,
        url: m.url,
        duration: m.duration || 0,
        size: m.size,
        thumbnails: [],
        waveform: [],
      })),
      isDirty: false,
    }),

    setProjectId: (projectId) => set({ projectId }),
    setProjectName: (projectName) => set({ projectName, isDirty: true }),
    markDirty: () => set({ isDirty: true }),
    markSaved: () => set({ isDirty: false, lastSavedAt: new Date().toISOString() }),

    // ========== Video Actions ==========
    
    setVideoUrl: (videoUrl) => set({ videoUrl }),
    setCurrentTime: (currentTime) => set({ currentTime }),
    setDuration: (duration) => set({ duration }),
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setVolume: (volume) => set({ volume }),
    setIsMuted: (isMuted) => set({ isMuted }),
    seekTo: (time) => set((state) => ({ 
      currentTime: time, 
      seekVersion: state.seekVersion + 1 
    })),

    // ========== Transcript Actions ==========
    
    setTranscript: (transcript) => set({ transcript }),
    setTranscriptionStatus: (transcriptionStatus) => set({ transcriptionStatus }),

    updateTranscript: (transcript) => {
      get().pushHistory();
      set({ transcript, isDirty: true });
    },

    selectWords: (selection) => set({ selectedWords: selection }),

    // ========== Text-Driven Editing Actions ==========

    deleteSelectedWords: () => {
      const { transcript, selectedWords } = get();
      if (!transcript || !selectedWords) return;

      get().pushHistory();

      const updatedSegments = transcript.segments.map(segment => {
        if (segment.id !== selectedWords.segmentId) return segment;

        const updatedWords = segment.words.map((word, index) => {
          if (index >= selectedWords.startWordIndex && index <= selectedWords.endWordIndex) {
            return { ...word, deleted: true };
          }
          return word;
        });

        return { ...segment, words: updatedWords };
      });

      set({
        transcript: { ...transcript, segments: updatedSegments },
        selectedWords: null,
        isDirty: true,
      });
    },

    restoreDeletedWords: (segmentId, wordIndices) => {
      const { transcript } = get();
      if (!transcript) return;

      get().pushHistory();

      const updatedSegments = transcript.segments.map(segment => {
        if (segment.id !== segmentId) return segment;

        const updatedWords = segment.words.map((word, index) => {
          if (wordIndices.includes(index)) {
            return { ...word, deleted: false };
          }
          return word;
        });

        return { ...segment, words: updatedWords };
      });

      set({
        transcript: { ...transcript, segments: updatedSegments },
        isDirty: true,
      });
    },

    cutSelection: () => {
      // T017: Cut selected words and update timeline
      const { transcript, selectedWords, timeline, mediaFiles } = get();
      if (!transcript || !selectedWords) return;

      // Find the segment and get the time range of selected words
      const segment = transcript.segments.find(
        (s) => s.id === selectedWords.segmentId
      );
      if (!segment) return;

      const startWord = segment.words[selectedWords.startWordIndex];
      const endWord = segment.words[selectedWords.endWordIndex];
      if (!startWord || !endWord) return;

      const cutStart = startWord.startTime;
      const cutEnd = endWord.endTime;
      const cutDuration = cutEnd - cutStart;

      // Mark words as deleted first (this pushes history)
      get().deleteSelectedWords();

      // Update timeline: find clips that overlap with the cut region and split/modify them
      if (timeline && timeline.tracks.length > 0) {
        const updatedTracks = timeline.tracks.map((track) => {
          // For video and audio tracks, we need to handle the cut
          if (track.type === 'video' || track.type === 'audio') {
            const updatedClips: typeof track.clips = [];
            
            for (const clip of track.clips) {
              const clipEnd = clip.startTime + clip.duration;
              
              // Check if clip overlaps with cut region
              if (clipEnd <= cutStart || clip.startTime >= cutEnd) {
                // Clip doesn't overlap - but might need to shift if after the cut
                if (clip.startTime >= cutEnd) {
                  // Shift clip earlier by the cut duration
                  updatedClips.push({
                    ...clip,
                    startTime: clip.startTime - cutDuration,
                  });
                } else {
                  // Clip is before the cut - no change
                  updatedClips.push(clip);
                }
              } else if (clip.startTime >= cutStart && clipEnd <= cutEnd) {
                // Clip is entirely within cut region - remove it
                // Don't add to updatedClips
              } else if (clip.startTime < cutStart && clipEnd > cutEnd) {
                // Cut is in the middle of clip - split into two clips
                const uuid = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                // First part (before cut)
                updatedClips.push({
                  ...clip,
                  id: clip.id,
                  duration: cutStart - clip.startTime,
                  sourceEnd: clip.sourceStart + (cutStart - clip.startTime),
                });
                
                // Second part (after cut) - shifted earlier by cutDuration
                updatedClips.push({
                  ...clip,
                  id: uuid(),
                  name: `${clip.name} (cont.)`,
                  startTime: cutStart, // Immediately after first part (no gap)
                  duration: clipEnd - cutEnd,
                  sourceStart: clip.sourceStart + (cutEnd - clip.startTime),
                  sourceEnd: clip.sourceEnd,
                });
              } else if (clip.startTime < cutStart && clipEnd <= cutEnd) {
                // Cut overlaps end of clip - trim the end
                updatedClips.push({
                  ...clip,
                  duration: cutStart - clip.startTime,
                  sourceEnd: clip.sourceStart + (cutStart - clip.startTime),
                });
              } else if (clip.startTime >= cutStart && clipEnd > cutEnd) {
                // Cut overlaps start of clip - trim the start and shift
                const overlapDuration = cutEnd - clip.startTime;
                updatedClips.push({
                  ...clip,
                  startTime: cutStart, // Shift to where the cut started (no gap)
                  duration: clip.duration - overlapDuration,
                  sourceStart: clip.sourceStart + overlapDuration,
                });
              }
            }
            
            return { ...track, clips: updatedClips };
          }
          return track;
        });

        // Calculate new timeline duration
        let newDuration = 0;
        for (const track of updatedTracks) {
          for (const clip of track.clips) {
            const clipEnd = clip.startTime + clip.duration;
            if (clipEnd > newDuration) newDuration = clipEnd;
          }
        }

        // Update timeline in state
        set({
          timeline: {
            ...timeline,
            tracks: updatedTracks,
            duration: newDuration,
          },
          tracks: updatedTracks,
        });
      }
    },

    // ========== Timeline Actions ==========
    
    setTimeline: (timeline) => set({ 
      timeline, 
      tracks: timeline.tracks,
      isDirty: true 
    }),

    setPlayheadPosition: (playheadPosition) => set({ playheadPosition }),

    addTrack: (track) => {
      get().pushHistory();
      set((state) => ({
        tracks: [...state.tracks, track],
        timeline: state.timeline ? {
          ...state.timeline,
          tracks: [...state.timeline.tracks, track],
        } : null,
        isDirty: true,
      }));
    },

    updateTrack: (id, updates) => {
      get().pushHistory();
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === id ? { ...track, ...updates } : track
        ),
        timeline: state.timeline ? {
          ...state.timeline,
          tracks: state.timeline.tracks.map((track) =>
            track.id === id ? { ...track, ...updates } : track
          ),
        } : null,
        isDirty: true,
      }));
    },

    removeTrack: (id) => {
      get().pushHistory();
      set((state) => ({
        tracks: state.tracks.filter((track) => track.id !== id),
        timeline: state.timeline ? {
          ...state.timeline,
          tracks: state.timeline.tracks.filter((track) => track.id !== id),
        } : null,
        isDirty: true,
      }));
    },

    addClip: (trackId, clip) => {
      get().pushHistory();
      set((state) => {
        const updateTracks = (tracks: Track[]) =>
          tracks.map((track) =>
            track.id === trackId
              ? { ...track, clips: [...track.clips, clip] }
              : track
          );

        return {
          tracks: updateTracks(state.tracks),
          timeline: state.timeline
            ? { ...state.timeline, tracks: updateTracks(state.timeline.tracks) }
            : null,
          isDirty: true,
        };
      });
    },

    updateClip: (trackId, clipId, updates) => {
      get().pushHistory();
      set((state) => {
        const updateTracks = (tracks: Track[]) =>
          tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  clips: track.clips.map((clip) =>
                    clip.id === clipId ? { ...clip, ...updates } : clip
                  ),
                }
              : track
          );

        return {
          tracks: updateTracks(state.tracks),
          timeline: state.timeline
            ? { ...state.timeline, tracks: updateTracks(state.timeline.tracks) }
            : null,
          isDirty: true,
        };
      });
    },

    removeClip: (trackId, clipId) => {
      get().pushHistory();
      set((state) => {
        const updateTracks = (tracks: Track[]) =>
          tracks.map((track) =>
            track.id === trackId
              ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }
              : track
          );

        return {
          tracks: updateTracks(state.tracks),
          timeline: state.timeline
            ? { ...state.timeline, tracks: updateTracks(state.timeline.tracks) }
            : null,
          isDirty: true,
        };
      });
    },

    splitClipAtPlayhead: (trackId, clipId) => {
      const { currentTime, tracks } = get();
      const track = tracks.find(t => t.id === trackId);
      const clip = track?.clips.find(c => c.id === clipId);
      
      if (!clip) return;
      
      // Check if playhead (currentTime) is within the clip
      const clipEnd = clip.startTime + clip.duration;
      if (currentTime <= clip.startTime || currentTime >= clipEnd) {
        return; // Playhead not within clip
      }

      get().pushHistory();

      const splitPoint = currentTime - clip.startTime;
      const sourceProgress = splitPoint / clip.duration;
      const sourceSplitTime = clip.sourceStart + (clip.sourceEnd - clip.sourceStart) * sourceProgress;

      // Create two clips from the split
      const clip1: Clip = {
        ...clip,
        duration: splitPoint,
        sourceEnd: sourceSplitTime,
      };

      const clip2: Clip = {
        ...clip,
        id: `${clip.id}-split-${Date.now()}`,
        startTime: currentTime,
        duration: clip.duration - splitPoint,
        sourceStart: sourceSplitTime,
      };

      set((state) => {
        const updateTracks = (tracks: Track[]) =>
          tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  clips: t.clips
                    .filter((c) => c.id !== clipId)
                    .concat([clip1, clip2])
                    .sort((a, b) => a.startTime - b.startTime),
                }
              : t
          );

        return {
          tracks: updateTracks(state.tracks),
          timeline: state.timeline
            ? { ...state.timeline, tracks: updateTracks(state.timeline.tracks) }
            : null,
          isDirty: true,
        };
      });
    },

    // ========== Media Actions ==========
    
    addMediaFile: (file) => {
      set((state) => ({
        mediaFiles: [...state.mediaFiles, file],
      }));
    },

    removeMediaFile: (id) => {
      set((state) => ({
        mediaFiles: state.mediaFiles.filter((file) => file.id !== id),
      }));
    },

    updateMediaThumbnails: (id, thumbnails) => {
      set((state) => ({
        mediaFiles: state.mediaFiles.map((file) =>
          file.id === id ? { ...file, thumbnails } : file
        ),
      }));
    },

    updateClipThumbnails: (mediaId, thumbnails) => {
      set((state) => ({
        tracks: state.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.mediaId === mediaId ? { ...clip, thumbnails } : clip
          ),
        })),
      }));
    },

    // ========== History Actions ==========
    
    pushHistory: () => {
      const { transcript, timeline, history, historyIndex } = get();
      
      // Truncate future history if we're not at the end
      const newHistory = history.slice(0, historyIndex + 1);
      
      newHistory.push({
        transcript: transcript ? JSON.parse(JSON.stringify(transcript)) : null,
        timeline: timeline ? JSON.parse(JSON.stringify(timeline)) : null,
      });

      // Keep max 50 history entries
      if (newHistory.length > 50) {
        newHistory.shift();
      }

      set({
        history: newHistory,
        historyIndex: newHistory.length - 1,
        canUndo: newHistory.length > 1,
        canRedo: false,
      });
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;

      const newIndex = historyIndex - 1;
      const entry = history[newIndex];

      set({
        transcript: entry.transcript,
        timeline: entry.timeline,
        tracks: entry.timeline?.tracks || [],
        historyIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true,
        isDirty: true,
      });
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;

      const newIndex = historyIndex + 1;
      const entry = history[newIndex];

      set({
        transcript: entry.transcript,
        timeline: entry.timeline,
        tracks: entry.timeline?.tracks || [],
        historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < history.length - 1,
        isDirty: true,
      });
    },

    // ========== Reset ==========
    
    reset: () => set(initialState),
  }))
);

// Selector helpers
export const selectDeletedWordRanges = (transcript: Transcript | null) => {
  if (!transcript) return [];
  
  const ranges: Array<{ segmentId: string; startTime: number; endTime: number }> = [];
  
  for (const segment of transcript.segments) {
    let rangeStart: number | null = null;
    
    for (let i = 0; i < segment.words.length; i++) {
      const word = segment.words[i];
      
      if (word.deleted && rangeStart === null) {
        rangeStart = word.startTime;
      }
      
      if (!word.deleted && rangeStart !== null) {
        ranges.push({
          segmentId: segment.id,
          startTime: rangeStart,
          endTime: segment.words[i - 1].endTime,
        });
        rangeStart = null;
      }
    }
    
    // Handle range extending to end of segment
    if (rangeStart !== null) {
      ranges.push({
        segmentId: segment.id,
        startTime: rangeStart,
        endTime: segment.words[segment.words.length - 1].endTime,
      });
    }
  }
  
  return ranges;
};

/**
 * T038: Auto-save setup
 * Subscribes to store changes and triggers save when dirty
 * Maximum 30s data loss as per Constitution V
 */
const AUTO_SAVE_DELAY = 5000; // 5 seconds debounce
const MAX_DATA_LOSS_INTERVAL = 30000; // 30 seconds max

let autoSaveTimeout: NodeJS.Timeout | null = null;
let lastAutoSave = 0;
let autoSaveEnabled = false;

export function enableAutoSave(saveFunction: (data: {
  projectId: string;
  transcript: Transcript | null;
  timeline: Timeline | null;
}) => Promise<void>) {
  if (autoSaveEnabled) return;
  autoSaveEnabled = true;

  // Subscribe to isDirty changes
  useEditorStore.subscribe(
    (state) => ({ isDirty: state.isDirty, projectId: state.projectId }),
    async (curr, prev) => {
      if (!curr.isDirty || !curr.projectId) return;

      const state = useEditorStore.getState();
      const now = Date.now();
      const timeSinceLastSave = now - lastAutoSave;

      // Clear existing timeout
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
      }

      // If approaching max data loss interval, save immediately
      if (timeSinceLastSave >= MAX_DATA_LOSS_INTERVAL - AUTO_SAVE_DELAY) {
        try {
          await saveFunction({
            projectId: state.projectId!,
            transcript: state.transcript,
            timeline: state.timeline,
          });
          lastAutoSave = now;
          useEditorStore.getState().markSaved();
          console.log('[AutoSave] Saved (max interval reached)');
        } catch (err) {
          console.error('[AutoSave] Failed:', err);
        }
        return;
      }

      // Otherwise, debounce the save
      autoSaveTimeout = setTimeout(async () => {
        const currentState = useEditorStore.getState();
        if (!currentState.isDirty || !currentState.projectId) return;

        try {
          await saveFunction({
            projectId: currentState.projectId,
            transcript: currentState.transcript,
            timeline: currentState.timeline,
          });
          lastAutoSave = Date.now();
          useEditorStore.getState().markSaved();
          console.log('[AutoSave] Saved (debounced)');
        } catch (err) {
          console.error('[AutoSave] Failed:', err);
        }
      }, AUTO_SAVE_DELAY);
    },
    { equalityFn: (a, b) => a.isDirty === b.isDirty && a.projectId === b.projectId }
  );

  console.log('[AutoSave] Enabled with 5s debounce, 30s max interval');
}

export function disableAutoSave() {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
  autoSaveEnabled = false;
  console.log('[AutoSave] Disabled');
}

