'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Save,
  Undo,
  Redo,
  Download,
  Settings,
  Play,
  ChevronLeft,
  Scissors,
  Type,
  Wand2,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { ExportDialog } from './ExportDialog';

interface ToolbarProps {
  projectId: string;
}

export function Toolbar({ projectId }: ToolbarProps) {
  const { projectName, canUndo, canRedo, undo, redo } = useEditorStore();
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <>
      <header className="h-14 border-b border-editor-border bg-editor-surface flex items-center px-4 gap-4">
        {/* Back & Project Name */}
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 hover:bg-editor-border rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-500 rounded flex items-center justify-center">
              <Play className="w-3 h-3" fill="white" />
            </div>
            <span className="font-medium">{projectName || 'Untitled Project'}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-editor-border" />

        {/* Edit Tools */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 hover:bg-editor-border rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 hover:bg-editor-border rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-editor-border" />

        {/* Editing Tools */}
        <div className="flex items-center gap-1">
          <button
            className="p-2 hover:bg-editor-border rounded-lg transition flex items-center gap-2 text-sm"
            title="Split clip (S)"
          >
            <Scissors className="w-4 h-4" />
            <span className="hidden md:inline">Split</span>
          </button>
          <button
            className="p-2 hover:bg-editor-border rounded-lg transition flex items-center gap-2 text-sm"
            title="Add text"
          >
            <Type className="w-4 h-4" />
            <span className="hidden md:inline">Text</span>
          </button>
          <button
            className="p-2 hover:bg-editor-border rounded-lg transition flex items-center gap-2 text-sm text-primary-400"
            title="AI Features"
          >
            <Wand2 className="w-4 h-4" />
            <span className="hidden md:inline">AI</span>
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Keyboard Shortcuts Help */}
        <div className="hidden lg:flex items-center text-xs text-gray-500 gap-3 mr-4">
          <span title="Split at playhead"><kbd className="bg-gray-700 px-1.5 py-0.5 rounded">S</kbd> Split</span>
          <span title="Cut selection"><kbd className="bg-gray-700 px-1.5 py-0.5 rounded">Del</kbd> Cut</span>
          <span title="Undo"><kbd className="bg-gray-700 px-1.5 py-0.5 rounded">⌘Z</kbd> Undo</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-editor-border rounded-lg transition" title="Save">
            <Save className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-editor-border rounded-lg transition" title="Settings">
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsExportOpen(true)}
            className="bg-primary-500 hover:bg-primary-600 px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Export Dialog */}
      <ExportDialog
        projectId={projectId}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </>
  );
}
