'use client';

import React, { useState, useRef, useCallback } from 'react';
import { underlordApi } from '@/lib/api';
import { useEditorStore } from '@/stores/editorStore';

interface ExportDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

type ExportStatus = 'idle' | 'exporting' | 'completed' | 'failed' | 'cancelled';

interface ExportProgress {
  percent: number;
  phase: string;
  currentOperation: string;
}

/**
 * Export Dialog — streams FFmpeg export progress via Underlord SSE endpoint.
 * Uses POST /api/ai/underlord/export with cut regions derived from deleted transcript words.
 */
export function ExportDialog({ projectId, isOpen, onClose }: ExportDialogProps) {
  // Export state
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState<ExportProgress>({ percent: 0, phase: '', currentOperation: '' });
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Get mediaId and transcript from store
  const mediaId = useEditorStore((state) => state.mediaFiles[0]?.id);
  const transcript = useEditorStore((state) => state.transcript);

  // Derive cut regions from deleted words
  const getCutRegions = useCallback(() => {
    if (!transcript?.segments) return [];
    const regions: Array<{ startTime: number; endTime: number }> = [];
    let regionStart: number | null = null;

    const allWords = transcript.segments.flatMap(seg =>
      seg.words.map(w => ({ startTime: w.startTime, endTime: w.endTime, deleted: w.deleted }))
    );

    for (let i = 0; i < allWords.length; i++) {
      const word = allWords[i];
      if (word.deleted) {
        if (regionStart === null) regionStart = word.startTime;
      } else {
        if (regionStart !== null) {
          regions.push({ startTime: regionStart, endTime: allWords[i - 1].endTime });
          regionStart = null;
        }
      }
    }
    if (regionStart !== null && allWords.length > 0) {
      regions.push({ startTime: regionStart, endTime: allWords[allWords.length - 1].endTime });
    }
    return regions;
  }, [transcript]);

  // Start export — streams SSE from Underlord export endpoint
  const handleStartExport = async () => {
    if (!mediaId) return;
    setStatus('exporting');
    setError(null);
    setDownloadUrl(null);
    setProgress({ percent: 0, phase: 'starting', currentOperation: 'Initializing export...' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await underlordApi.export(mediaId, getCutRegions());
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6));
            if (event.type === 'progress') {
              setProgress({
                percent: event.percent ?? 0,
                phase: 'encoding',
                currentOperation: event.operation || 'Processing...',
              });
            } else if (event.type === 'done') {
              setStatus('completed');
              setDownloadUrl(event.downloadUrl);
              setProgress({ percent: 100, phase: 'complete', currentOperation: 'Export complete!' });
            } else if (event.type === 'error') {
              setStatus('failed');
              setError(event.message || 'Export failed');
            }
          } catch {
            // malformed event — skip
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatus('failed');
        setError(err.message || 'Export failed');
      }
    }
  };

  // Cancel export
  const handleCancel = () => {
    abortRef.current?.abort();
    setStatus('cancelled');
  };

  // Trigger browser download
  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `export_${projectId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reset on close
  const handleClose = () => {
    if (status === 'exporting') {
      if (!confirm('Export in progress. Cancel and close?')) return;
      handleCancel();
    }
    setStatus('idle');
    setProgress({ percent: 0, phase: '', currentOperation: '' });
    setError(null);
    setDownloadUrl(null);
    onClose();
  };

  if (!isOpen) return null;

  const cutRegions = getCutRegions();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Export Video</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {status === 'idle' ? (
          <div className="space-y-6">
            {/* Cut Regions Summary */}
            {cutRegions.length > 0 ? (
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-sm text-gray-300">
                  <span className="text-yellow-400">✂</span> {cutRegions.length} cut region(s) will be removed
                </p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-sm text-gray-400">No cuts applied — exports full video</p>
              </div>
            )}

            {/* Media check */}
            {!mediaId && (
              <p className="text-sm text-yellow-400">Upload a video first to export.</p>
            )}

            <button
              onClick={handleStartExport}
              disabled={!mediaId}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              Start Export
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              {status === 'exporting' && (
                <span className="flex items-center gap-2 text-blue-400">
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting...
                </span>
              )}
              {status === 'completed' && (
                <span className="flex items-center gap-2 text-green-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Export Complete
                </span>
              )}
              {status === 'failed' && (
                <span className="flex items-center gap-2 text-red-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Export Failed
                </span>
              )}
              {status === 'cancelled' && (
                <span className="flex items-center gap-2 text-yellow-400">Cancelled</span>
              )}
            </div>

            {/* Progress Bar */}
            {status === 'exporting' && (
              <div>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>{progress.currentOperation}</span>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {status === 'exporting' && (
                <button onClick={handleCancel} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                  Cancel
                </button>
              )}
              {status === 'completed' && (
                <>
                  <button onClick={handleDownload} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">
                    Download
                  </button>
                  <button onClick={handleClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    Close
                  </button>
                </>
              )}
              {(status === 'failed' || status === 'cancelled') && (
                <>
                  <button onClick={() => { setStatus('idle'); setError(null); }} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Try Again
                  </button>
                  <button onClick={handleClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExportDialog;
