/**
 * Timeline Component (T022, T023, T025, T026, T027, T028)
 * 
 * Multi-track timeline editor with:
 * - Multi-track rendering (video, audio, caption)
 * - Clip selection, drag-and-drop, and snapping
 * - Playhead with split keyboard shortcut (S)
 * - Track management (add/remove/mute)
 * - 60fps scrubbing target
 */

'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { 
  ZoomIn, 
  ZoomOut, 
  Magnet, 
  Trash2, 
  Volume2, 
  VolumeX,
  Plus,
  Lock,
  Unlock,
  Scissors,
  Video,
  Music,
  Type,
  ChevronDown,
} from 'lucide-react';
import { Clip, Track } from '@shared/types';

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragClipStartTime, setDragClipStartTime] = useState(0);
  const [showAddTrackMenu, setShowAddTrackMenu] = useState(false);

  const { 
    currentTime, 
    duration, 
    tracks, 
    setCurrentTime, 
    updateTrack,
    addTrack,
    removeTrack,
    splitClipAtPlayhead,
    removeClip,
  } = useEditorStore();

  const pixelsPerSecond = 50 * zoom;
  const timelineWidth = Math.max(duration * pixelsPerSecond, 800);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / pixelsPerSecond;
    setCurrentTime(Math.max(0, Math.min(time, duration)));
    setSelectedClipId(null);
    setShowAddTrackMenu(false);
  }, [isDragging, pixelsPerSecond, duration, setCurrentTime]);

  // Clip drag handlers
  const handleClipMouseDown = useCallback((e: React.MouseEvent, clip: Clip, track: Track) => {
    e.stopPropagation();
    if (track.locked) return;
    setSelectedClipId(clip.id);
    setSelectedTrackId(track.id);
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragClipStartTime(clip.startTime);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedClipId) return;

    const deltaX = e.clientX - dragStartX;
    const deltaTime = deltaX / pixelsPerSecond;
    let newStartTime = Math.max(0, dragClipStartTime + deltaTime);

    // Snap to grid if enabled (T026)
    if (snapEnabled) {
      const snapValue = zoom >= 2 ? 0.1 : zoom >= 1 ? 0.25 : 0.5;
      newStartTime = Math.round(newStartTime / snapValue) * snapValue;
    }

    // Update clip position
    tracks.forEach(track => {
      const clipIndex = track.clips.findIndex(c => c.id === selectedClipId);
      if (clipIndex !== -1) {
        const updatedClips = [...track.clips];
        updatedClips[clipIndex] = { ...updatedClips[clipIndex], startTime: newStartTime };
        updateTrack(track.id, { clips: updatedClips });
      }
    });
  }, [isDragging, selectedClipId, dragStartX, dragClipStartTime, pixelsPerSecond, snapEnabled, zoom, tracks, updateTrack]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Delete selected clip
  const deleteSelectedClip = useCallback(() => {
    if (!selectedClipId || !selectedTrackId) return;
    removeClip(selectedTrackId, selectedClipId);
    setSelectedClipId(null);
    setSelectedTrackId(null);
  }, [selectedClipId, selectedTrackId, removeClip]);

  // Split clip at playhead (T023, T024)
  const handleSplitAtPlayhead = useCallback(() => {
    if (!selectedClipId || !selectedTrackId) return;
    
    const track = tracks.find(t => t.id === selectedTrackId);
    const clip = track?.clips.find(c => c.id === selectedClipId);
    
    if (clip) {
      // Check if playhead is within the clip
      const clipEnd = clip.startTime + clip.duration;
      if (currentTime > clip.startTime && currentTime < clipEnd) {
        splitClipAtPlayhead(selectedTrackId, selectedClipId);
      }
    }
  }, [selectedClipId, selectedTrackId, tracks, currentTime, splitClipAtPlayhead]);

  // Toggle track mute
  const toggleTrackMute = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      updateTrack(trackId, { muted: !track.muted });
    }
  }, [tracks, updateTrack]);

  // Toggle track lock
  const toggleTrackLock = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      updateTrack(trackId, { locked: !track.locked });
    }
  }, [tracks, updateTrack]);

  // Add new track (T027)
  const handleAddTrack = useCallback((type: 'video' | 'audio' | 'caption') => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track ${tracks.filter(t => t.type === type).length + 1}`,
      clips: [],
      muted: false,
      volume: 1,
      locked: false,
    };
    addTrack(newTrack);
    setShowAddTrackMenu(false);
  }, [tracks, addTrack]);

  // Remove track
  const handleRemoveTrack = useCallback((trackId: string) => {
    if (tracks.length <= 1) return; // Keep at least one track
    removeTrack(trackId);
    if (selectedTrackId === trackId) {
      setSelectedTrackId(null);
      setSelectedClipId(null);
    }
  }, [tracks.length, removeTrack, selectedTrackId]);

  // Keyboard shortcuts (T023)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedClip();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSplitAtPlayhead();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedClip, handleSplitAtPlayhead]);

  // Memoized time markers for 60fps performance (T028)
  const timeMarkers = useMemo(() => {
    const markers = [];
    const step = zoom >= 2 ? 0.5 : zoom >= 1 ? 1 : 2;
    for (let i = 0; i <= Math.ceil(duration); i += step) {
      markers.push(i);
    }
    return markers;
  }, [duration, zoom]);

  return (
    <div className="h-full flex flex-col">
      {/* Timeline Controls */}
      <div className="h-10 border-b border-editor-border flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            className="p-1.5 hover:bg-editor-border rounded transition"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-editor-muted w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            className="p-1.5 hover:bg-editor-border rounded transition"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-6 bg-editor-border" />

        <button
          onClick={() => setSnapEnabled(!snapEnabled)}
          className={`p-1.5 rounded transition flex items-center gap-2 text-sm ${
            snapEnabled ? 'bg-primary-500/20 text-primary-400' : 'hover:bg-editor-border'
          }`}
          title="Toggle snap to grid"
        >
          <Magnet className="w-4 h-4" />
          <span>Snap</span>
        </button>

        {selectedClipId && (
          <>
            <div className="w-px h-6 bg-editor-border" />
            <button
              onClick={handleSplitAtPlayhead}
              className="p-1.5 hover:bg-editor-border rounded transition flex items-center gap-2 text-sm"
              title="Split at playhead (S)"
            >
              <Scissors className="w-4 h-4" />
              <span>Split</span>
            </button>
            <button
              onClick={deleteSelectedClip}
              className="p-1.5 hover:bg-red-500/20 rounded transition flex items-center gap-2 text-sm text-red-400"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* Add Track Button (T027) */}
        <div className="relative">
          <button
            onClick={() => setShowAddTrackMenu(!showAddTrackMenu)}
            className="p-1.5 hover:bg-editor-border rounded transition flex items-center gap-2 text-sm"
            title="Add track"
          >
            <Plus className="w-4 h-4" />
            <span>Add Track</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showAddTrackMenu && (
            <div className="absolute right-0 top-full mt-1 bg-editor-surface border border-editor-border rounded-md shadow-lg py-1 z-30 min-w-[140px]">
              <button
                onClick={() => handleAddTrack('video')}
                className="w-full px-3 py-2 text-left text-sm hover:bg-editor-border flex items-center gap-2"
              >
                <Video className="w-4 h-4" />
                Video Track
              </button>
              <button
                onClick={() => handleAddTrack('audio')}
                className="w-full px-3 py-2 text-left text-sm hover:bg-editor-border flex items-center gap-2"
              >
                <Music className="w-4 h-4" />
                Audio Track
              </button>
              <button
                onClick={() => handleAddTrack('caption')}
                className="w-full px-3 py-2 text-left text-sm hover:bg-editor-border flex items-center gap-2"
              >
                <Type className="w-4 h-4" />
                Caption Track
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-editor-border" />

        <span className="text-sm text-editor-muted">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={containerRef}>
        <div
          className="relative h-full min-w-full"
          style={{ width: timelineWidth }}
          onClick={handleTimelineClick}
        >
          {/* Time Ruler */}
          <div className="h-6 border-b border-editor-border relative">
            {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: i * pixelsPerSecond }}
              >
                <div className="h-2 w-px bg-editor-border" />
                <span className="text-xs text-editor-muted">{i}s</span>
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary-500 z-20"
            style={{ left: currentTime * pixelsPerSecond }}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary-500 rotate-45" />
          </div>

          {/* Tracks */}
          <div className="absolute top-6 left-0 right-0 bottom-0">
            {tracks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-editor-muted">
                <p>Add media to start editing</p>
              </div>
            ) : (
              tracks.map((track, index) => (
                <div
                  key={track.id}
                  className="h-32 border-b border-editor-border relative"
                >
                  {/* Track Label */}
                  <div className="absolute left-0 top-0 bottom-0 w-32 bg-editor-bg border-r border-editor-border flex flex-col justify-center px-2 z-10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-editor-muted truncate flex items-center gap-1">
                        {track.type === 'video' && <Video className="w-3 h-3" />}
                        {track.type === 'audio' && <Music className="w-3 h-3" />}
                        {track.type === 'caption' && <Type className="w-3 h-3" />}
                        <span className="truncate">{track.name}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => toggleTrackMute(track.id)}
                        className={`p-1 rounded transition ${track.muted ? 'text-red-400' : 'text-editor-muted hover:text-white'}`}
                        title={track.muted ? 'Unmute' : 'Mute'}
                      >
                        {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => toggleTrackLock(track.id)}
                        className={`p-1 rounded transition ${track.locked ? 'text-yellow-400' : 'text-editor-muted hover:text-white'}`}
                        title={track.locked ? 'Unlock' : 'Lock'}
                      >
                        {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>
                      {tracks.length > 1 && (
                        <button
                          onClick={() => handleRemoveTrack(track.id)}
                          className="p-1 rounded transition text-editor-muted hover:text-red-400"
                          title="Remove track"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Clips */}
                  <div className="absolute left-32 top-1 bottom-1 right-0">
                    {track.clips.map((clip) => (
                      <TimelineClip
                        key={clip.id}
                        clip={clip}
                        track={track}
                        pixelsPerSecond={pixelsPerSecond}
                        isSelected={selectedClipId === clip.id}
                        onMouseDown={(e) => handleClipMouseDown(e, clip, track)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// Timeline Clip Component with Thumbnails/Waveform
interface TimelineClipProps {
  clip: Clip;
  track: Track;
  pixelsPerSecond: number;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

// Track height in pixels (matches h-32 = 128px for clearer thumbnails)
const TRACK_HEIGHT = 128;

function TimelineClip({ clip, track, pixelsPerSecond, isSelected, onMouseDown }: TimelineClipProps) {
  const clipWidth = clip.duration * pixelsPerSecond;
  
  // Simply show all available thumbnails, evenly distributed across the clip
  // With 1fps generation, a 53s video has ~53 thumbnails
  const thumbnails = clip.thumbnails || [];
  const thumbnailWidth = thumbnails.length > 0 ? clipWidth / thumbnails.length : clipWidth;
  
  return (
    <div
      className={`absolute top-0 bottom-0 rounded-md cursor-move overflow-hidden transition-shadow ${
        isSelected 
          ? 'ring-2 ring-primary-400 shadow-lg' 
          : 'hover:ring-1 hover:ring-primary-400/50'
      }`}
      style={{
        left: clip.startTime * pixelsPerSecond,
        width: clipWidth,
      }}
      onMouseDown={onMouseDown}
    >
      {/* Video Clip with Thumbnails - Descript Style */}
      {track.type === 'video' && (
        <div className="absolute inset-0 bg-editor-bg overflow-hidden">
          {thumbnails.length > 0 ? (
            <div className="absolute inset-0 flex">
              {thumbnails.map((thumb, i) => (
                <div
                  key={i}
                  className="h-full flex-shrink-0"
                  style={{
                    width: thumbnailWidth,
                  }}
                >
                  {/* Thumbnail image - fixed size, object-cover to fill */}
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover object-center"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full bg-primary-700 flex items-center justify-center">
              <div className="flex flex-col items-center gap-1">
                <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-white/70">Loading...</span>
              </div>
            </div>
          )}
          
          {/* Top border accent */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-primary-400" />
          
          {/* Clip name overlay - bottom left */}
          <div className="absolute left-1 bottom-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white truncate max-w-[80%]">
            {clip.name}
          </div>
          
          {/* Duration badge - bottom right */}
          <div className="absolute right-1 bottom-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white/80">
            {formatDuration(clip.duration)}
          </div>
        </div>
      )}

      {/* Audio Clip with Waveform */}
      {track.type === 'audio' && (
        <div className="absolute inset-0 bg-green-900/90">
          {clip.waveform && clip.waveform.length > 0 ? (
            <div className="w-full h-full flex items-center gap-px px-1 py-2">
              {clip.waveform.map((value, i) => (
                <div
                  key={i}
                  className="flex-1 bg-green-400/80 rounded-sm min-w-[1px]"
                  style={{
                    height: `${Math.max(15, value * 100)}%`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-white/70">Audio</span>
            </div>
          )}
          
          {/* Top border accent */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-green-400" />
          
          {/* Clip name overlay */}
          <div className="absolute left-1 bottom-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white truncate max-w-[80%]">
            {clip.name}
          </div>
          
          {/* Duration badge */}
          <div className="absolute right-1 bottom-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white/80">
            {formatDuration(clip.duration)}
          </div>
        </div>
      )}

      {/* Resize Handles */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-white/0 hover:bg-white/30 cursor-ew-resize transition-colors" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/0 hover:bg-white/30 cursor-ew-resize transition-colors" />
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}
