'use client';

import React from 'react';

/**
 * T041: Loading Skeletons for transcript and timeline
 * Provides visual feedback during content loading
 */

// Base skeleton animation class
const skeletonBaseClass = 'animate-pulse bg-gray-700 rounded';

/**
 * Transcript Loading Skeleton
 * Shows placeholder word boxes during transcription loading
 */
export function TranscriptSkeleton() {
  // Generate random line widths for realistic appearance
  const lines = [
    [85, 92, 78, 88, 95, 82],
    [90, 75, 88, 92, 80, 85, 78],
    [88, 95, 72, 85, 90, 88],
    [75, 90, 85, 92, 78, 85, 90],
    [92, 80, 88, 75, 95, 82],
  ];

  return (
    <div className="space-y-4 p-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`${skeletonBaseClass} h-6 w-32`} />
        <div className={`${skeletonBaseClass} h-4 w-24`} />
      </div>

      {/* Segment skeletons */}
      {lines.map((wordWidths, lineIndex) => (
        <div key={lineIndex} className="space-y-2">
          {/* Timestamp */}
          <div className={`${skeletonBaseClass} h-3 w-16`} />
          
          {/* Words row */}
          <div className="flex flex-wrap gap-1">
            {wordWidths.map((width, wordIndex) => (
              <div
                key={wordIndex}
                className={`${skeletonBaseClass} h-6`}
                style={{ width: `${width}px` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Timeline Loading Skeleton
 * Shows placeholder tracks and clips during timeline loading
 */
export function TimelineSkeleton() {
  const tracks = [
    { type: 'video', clips: [{ start: 0, width: 60 }, { start: 65, width: 35 }] },
    { type: 'audio', clips: [{ start: 5, width: 90 }] },
    { type: 'caption', clips: [{ start: 10, width: 40 }, { start: 55, width: 30 }] },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Controls skeleton */}
      <div className="h-10 border-b border-editor-border flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className={`${skeletonBaseClass} h-6 w-6`} />
          <div className={`${skeletonBaseClass} h-4 w-12`} />
          <div className={`${skeletonBaseClass} h-6 w-6`} />
        </div>
        <div className="w-px h-6 bg-editor-border" />
        <div className={`${skeletonBaseClass} h-6 w-20`} />
      </div>

      {/* Time ruler skeleton */}
      <div className="h-8 border-b border-editor-border flex items-center px-4">
        <div className="flex gap-16">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${skeletonBaseClass} h-3 w-8`} />
          ))}
        </div>
      </div>

      {/* Tracks skeleton */}
      <div className="flex-1 overflow-auto">
        {tracks.map((track, trackIndex) => (
          <div key={trackIndex} className="flex border-b border-editor-border">
            {/* Track header */}
            <div className="w-32 p-2 border-r border-editor-border">
              <div className="flex items-center gap-2">
                <div className={`${skeletonBaseClass} h-5 w-5`} />
                <div className={`${skeletonBaseClass} h-4 w-16`} />
              </div>
            </div>
            
            {/* Track content */}
            <div className="flex-1 h-20 relative p-2">
              {track.clips.map((clip, clipIndex) => (
                <div
                  key={clipIndex}
                  className={`${skeletonBaseClass} absolute h-14 top-3`}
                  style={{
                    left: `${clip.start}%`,
                    width: `${clip.width}%`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Video Player Loading Skeleton
 * Shows placeholder for video player area
 */
export function VideoPlayerSkeleton() {
  return (
    <div className="h-full flex flex-col">
      {/* Video area */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className={`${skeletonBaseClass} w-full h-full max-w-2xl max-h-80`} />
      </div>

      {/* Progress bar skeleton */}
      <div className="h-8 bg-editor-surface border-t border-editor-border flex items-center px-4 gap-4">
        <div className={`${skeletonBaseClass} h-1 flex-1`} />
      </div>

      {/* Controls skeleton */}
      <div className="h-12 bg-editor-surface border-t border-editor-border flex items-center justify-center gap-4">
        <div className={`${skeletonBaseClass} h-8 w-8 rounded-full`} />
        <div className={`${skeletonBaseClass} h-8 w-10 rounded-full`} />
        <div className={`${skeletonBaseClass} h-8 w-8 rounded-full`} />
        <div className="flex-1" />
        <div className={`${skeletonBaseClass} h-4 w-20`} />
        <div className={`${skeletonBaseClass} h-6 w-6`} />
      </div>
    </div>
  );
}

/**
 * Full Editor Loading Skeleton
 * Complete loading state for the entire editor
 */
export function EditorSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-editor-bg text-editor-text">
      {/* Toolbar skeleton */}
      <div className="h-14 border-b border-editor-border bg-editor-surface flex items-center px-4 gap-4">
        <div className={`${skeletonBaseClass} h-8 w-8`} />
        <div className={`${skeletonBaseClass} h-5 w-40`} />
        <div className="w-px h-6 bg-editor-border" />
        <div className="flex gap-2">
          <div className={`${skeletonBaseClass} h-6 w-6`} />
          <div className={`${skeletonBaseClass} h-6 w-6`} />
        </div>
        <div className="flex-1" />
        <div className={`${skeletonBaseClass} h-8 w-24`} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex">
        {/* Left panel - Transcript */}
        <div className="w-80 border-r border-editor-border">
          <TranscriptSkeleton />
        </div>

        {/* Center - Video Player */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <VideoPlayerSkeleton />
          </div>
          
          {/* Timeline */}
          <div className="h-48 border-t border-editor-border">
            <TimelineSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Generic skeleton line component
 */
export function SkeletonLine({ width = '100%', height = '1rem', className = '' }: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <div 
      className={`${skeletonBaseClass} ${className}`}
      style={{ width, height }}
    />
  );
}

/**
 * Skeleton text block for paragraph content
 */
export function SkeletonParagraph({ lines = 3, className = '' }: {
  lines?: number;
  className?: string;
}) {
  const lineWidths = ['100%', '95%', '88%', '92%', '85%'];
  
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i}
          className={`${skeletonBaseClass} h-4`}
          style={{ width: lineWidths[i % lineWidths.length] }}
        />
      ))}
    </div>
  );
}

export default {
  TranscriptSkeleton,
  TimelineSkeleton,
  VideoPlayerSkeleton,
  EditorSkeleton,
  SkeletonLine,
  SkeletonParagraph,
};
