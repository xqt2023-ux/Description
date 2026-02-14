/**
 * VideoPlayer Component (T018)
 * 
 * Video playback with timeline-aware features:
 * - Syncs with editor store for play/pause/seek
 * - Skips over cut (deleted) regions during playback
 * - Visual indication of cut regions in progress bar
 * - Responds to transcript word clicks for seeking
 */

'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useEditorStore, selectDeletedWordRanges } from '@/stores/editorStore';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Scissors,
} from 'lucide-react';

interface CutRegion {
  startTime: number;
  endTime: number;
}

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    videoUrl,
    transcript,
    seekVersion,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setVolume,
    setIsMuted,
  } = useEditorStore();

  // Get cut regions from transcript
  const cutRegions = useMemo(() => {
    return selectDeletedWordRanges(transcript);
  }, [transcript]);

  // Check if a time is within a cut region
  const isInCutRegion = useCallback((time: number): CutRegion | null => {
    for (const region of cutRegions) {
      if (time >= region.startTime && time < region.endTime) {
        return region;
      }
    }
    return null;
  }, [cutRegions]);

  // Get the next play position (skipping cut regions)
  const getNextPlayPosition = useCallback((time: number): number => {
    const cutRegion = isInCutRegion(time);
    if (cutRegion) {
      return cutRegion.endTime;
    }
    return time;
  }, [isInCutRegion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      
      // Check if we're in a cut region - if so, skip to end of region
      const cutRegion = isInCutRegion(time);
      if (cutRegion && isPlaying) {
        video.currentTime = cutRegion.endTime;
        return;
      }
      
      setCurrentTime(time);
    };
    
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [setCurrentTime, setDuration, setIsPlaying, isInCutRegion, isPlaying]);

  // Listen for user-initiated seeks (e.g., clicking on transcript words)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || seekVersion === 0) return;
    
    // Use store.getState() to get the latest currentTime
    const state = useEditorStore.getState();
    console.log('VideoPlayer seeking to:', state.currentTime);
    video.currentTime = state.currentTime;
  }, [seekVersion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = volume;
    video.muted = isMuted;
  }, [volume, isMuted]);

  // Sync isPlaying state with video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Play failed:', error);
          setIsPlaying(false);
        });
      }
    } else {
      video.pause();
    }
  }, [isPlaying, setIsPlaying]);

  const togglePlay = useCallback(() => {
    console.log('togglePlay called, isPlaying:', isPlaying);
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
  };

  const skipBackward = () => seekTo(currentTime - 5);
  const skipForward = () => seekTo(currentTime + 5);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate total cut duration for display
  const totalCutDuration = useMemo(() => {
    return cutRegions.reduce((sum, region) => sum + (region.endTime - region.startTime), 0);
  }, [cutRegions]);

  const effectiveDuration = duration - totalCutDuration;

  return (
    <div 
      className="w-full max-w-4xl"
      onClick={(e) => {
        console.log('Outer div clicked!', e.target);
      }}
    >
      {/* Video Container */}
      <div 
        className="relative aspect-video bg-black rounded-lg overflow-hidden cursor-pointer"
        title="Click to play/pause"
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain cursor-pointer"
            onClick={(e) => {
              console.log('Video clicked!');
              e.stopPropagation();
              togglePlay();
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-editor-muted">
            <div className="text-center">
              <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No video loaded</p>
              <p className="text-sm">Upload a video to get started</p>
            </div>
          </div>
        )}
        
        {/* Cut region indicator overlay */}
        {isInCutRegion(currentTime) && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600/80 px-3 py-1 rounded text-sm flex items-center gap-2">
            <Scissors className="w-4 h-4" />
            Cut region - will be skipped
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 bg-editor-surface rounded-lg p-4 border border-editor-border">
        {/* Progress Bar with Cut Regions */}
        <div className="mb-4 relative">
          {/* Cut region markers */}
          {duration > 0 && cutRegions.map((region, idx) => (
            <div
              key={idx}
              className="absolute top-0 h-2 bg-red-500/60 rounded z-10 pointer-events-none"
              style={{
                left: `${(region.startTime / duration) * 100}%`,
                width: `${((region.endTime - region.startTime) / duration) * 100}%`,
              }}
              title={`Cut: ${formatTime(region.startTime)} - ${formatTime(region.endTime)}`}
            />
          ))}
          
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            className="w-full h-2 bg-editor-border rounded-lg appearance-none cursor-pointer accent-primary-500 relative z-20"
          />
          
          <div className="flex justify-between text-sm text-editor-muted mt-1">
            <span>{formatTime(currentTime)}</span>
            <div className="flex items-center gap-2">
              {totalCutDuration > 0 && (
                <span className="text-red-400 flex items-center gap-1">
                  <Scissors className="w-3 h-3" />
                  -{formatTime(totalCutDuration)}
                </span>
              )}
              <span>{formatTime(duration)}</span>
              {totalCutDuration > 0 && (
                <span className="text-green-400">
                  (Final: {formatTime(effectiveDuration)})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={skipBackward}
            className="p-2 hover:bg-editor-border rounded-lg transition"
            title="Skip back 5s"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlay}
            className="p-4 bg-primary-500 hover:bg-primary-600 rounded-full transition"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6" fill="white" />
            )}
          </button>

          <button
            onClick={skipForward}
            className="p-2 hover:bg-editor-border rounded-lg transition"
            title="Skip forward 5s"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 ml-8">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 hover:bg-editor-border rounded-lg transition"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-24 h-2 bg-editor-border rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>

          <button
            onClick={() => videoRef.current?.requestFullscreen()}
            className="p-2 hover:bg-editor-border rounded-lg transition ml-auto"
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
