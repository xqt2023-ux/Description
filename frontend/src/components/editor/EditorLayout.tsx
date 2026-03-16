'use client';

import { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { TranscriptEditor } from './TranscriptEditor';
import { Timeline } from '../timeline/Timeline';
import { Toolbar } from './Toolbar';
import { MediaLibrary } from './MediaLibrary';
import { InteractiveWorkflowSidebar } from './InteractiveWorkflowSidebar';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface EditorLayoutProps {
  projectId: string;
}

export function EditorLayout({ projectId }: EditorLayoutProps) {
  const [showSidebar, setShowSidebar] = useState(true);
  const showWorkflowSidebar = false;

  // Resizable timeline panel
  const [timelineHeight, setTimelineHeight] = useState(192);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;
    document.body.style.cursor = 'ns-resize';

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setTimelineHeight(Math.max(80, Math.min(600, startHeight + delta)));
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="h-screen flex flex-col bg-editor-bg">
      {/* Top Toolbar */}
      <Toolbar projectId={projectId} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Media Library */}
        {showSidebar && (
          <aside className="w-64 border-r border-editor-border bg-editor-surface flex flex-col">
            <MediaLibrary />
          </aside>
        )}

        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="fixed top-1/2 -translate-y-1/2 z-50 bg-editor-surface border border-editor-border rounded-r-lg p-2 hover:bg-editor-border transition"
          style={{ left: showSidebar ? '256px' : '0' }}
        >
          {showSidebar ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </button>

        {/* Center - Video + Transcript */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {/* Video Preview */}
            <div className="flex-1 p-4 flex items-center justify-center">
              <VideoPlayer />
            </div>

            {/* Transcript Panel - Hide when workflow sidebar is shown */}
            {!showWorkflowSidebar && (
              <div className="w-96 border-l border-editor-border bg-editor-surface overflow-hidden flex flex-col">
                <div className="p-4 border-b border-editor-border">
                  <h2 className="font-semibold">Transcript</h2>
                  <p className="text-sm text-editor-muted">
                    Edit text to edit video
                  </p>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <TranscriptEditor />
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar - Interactive Workflow */}
        {showWorkflowSidebar && (
          <aside className="w-96 border-l border-editor-border bg-editor-surface overflow-hidden">
            <InteractiveWorkflowSidebar />
          </aside>
        )}
      </div>

      {/* Resize Handle between main content and timeline */}
      <div
        className="flex-shrink-0 flex items-center justify-center group"
        style={{ height: 8, cursor: 'ns-resize', backgroundColor: '#2a2a40' }}
        onMouseDown={handleResizeMouseDown}
      >
        <div
          className="w-12 rounded-full transition-colors"
          style={{ height: 3, backgroundColor: '#4a4a6a', pointerEvents: 'none' }}
        />
      </div>

      {/* Bottom - Timeline (resizable) */}
      <div
        className="bg-editor-surface flex-shrink-0"
        style={{ height: timelineHeight }}
      >
        <Timeline />
      </div>
    </div>
  );
}
