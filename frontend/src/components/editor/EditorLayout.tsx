'use client';

import { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { TranscriptEditor } from './TranscriptEditor';
import { Timeline } from '../timeline/Timeline';
import { Toolbar } from './Toolbar';
import { MediaLibrary } from './MediaLibrary';
import { InteractiveWorkflowSidebar } from './InteractiveWorkflowSidebar';
import { useEditorStore } from '@/stores/editorStore';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface EditorLayoutProps {
  projectId: string;
}

export function EditorLayout({ projectId }: EditorLayoutProps) {
  const [showSidebar, setShowSidebar] = useState(true);
  const [showWorkflowSidebar, setShowWorkflowSidebar] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const { currentTime, duration, isPlaying } = useEditorStore();

  const handleStartInteractiveEdit = (userRequest: string) => {
    // This will be called from Toolbar
    setShowWorkflowSidebar(true);
    // WorkflowId will be set by the InteractiveWorkflowSidebar component
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
        {showWorkflowSidebar && workflowId && (
          <aside className="w-96 border-l border-editor-border bg-editor-surface overflow-hidden">
            <InteractiveWorkflowSidebar
              workflowId={workflowId}
            />
          </aside>
        )}
      </div>

      {/* Bottom - Timeline */}
      <div className="h-48 border-t border-editor-border bg-editor-surface">
        <Timeline />
      </div>
    </div>
  );
}
