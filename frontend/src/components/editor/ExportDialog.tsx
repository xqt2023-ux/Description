'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { exportApi } from '@/lib/api';
import { useEditorStore } from '@/stores/editorStore';

interface ExportDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

type ExportFormat = 'mp4' | 'webm' | 'gif';
type ExportResolution = '2160p' | '1080p' | '720p' | '480p';
type ExportQuality = 'high' | 'medium' | 'low';
type ExportStatus = 'idle' | 'exporting' | 'completed' | 'failed' | 'cancelled';

interface ExportProgress {
  percent: number;
  phase: string;
  currentOperation: string;
  timeRemaining?: number;
}

/**
 * T035: Export Dialog with format/quality options
 * T036: Export progress indicator with cancel support  
 * T037: Export job polling and download trigger
 */
export function ExportDialog({ projectId, isOpen, onClose }: ExportDialogProps) {
  // Export options
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [quality, setQuality] = useState<ExportQuality>('high');

  // Export state
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState<ExportProgress>({
    percent: 0,
    phase: '',
    currentOperation: '',
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Get cut regions from store
  const transcript = useEditorStore((state) => state.transcript);

  // Derive cut regions from deleted words
  const getCutRegions = useCallback(() => {
    if (!transcript?.segments) return [];

    // Flatten all words from all segments
    const allWords = transcript.segments.flatMap(segment => 
      segment.words.map(word => ({
        ...word,
        start: word.startTime,
        end: word.endTime,
      }))
    );

    if (allWords.length === 0) return [];

    const regions: Array<{ startTime: number; endTime: number }> = [];
    let regionStart: number | null = null;

    for (let i = 0; i < allWords.length; i++) {
      const word = allWords[i];
      if (word.deleted) {
        if (regionStart === null) {
          regionStart = word.start;
        }
      } else {
        if (regionStart !== null) {
          const lastDeletedWord = allWords[i - 1];
          regions.push({
            startTime: regionStart,
            endTime: lastDeletedWord.end,
          });
          regionStart = null;
        }
      }
    }

    // Handle trailing deleted words
    if (regionStart !== null) {
      const lastWord = allWords[allWords.length - 1];
      regions.push({
        startTime: regionStart,
        endTime: lastWord.end,
      });
    }

    return regions;
  }, [transcript]);

  // Start export
  const handleStartExport = async () => {
    setStatus('exporting');
    setError(null);
    setProgress({ percent: 0, phase: 'starting', currentOperation: 'Initializing export...' });

    try {
      const cutRegions = getCutRegions();
      
      const response = await exportApi.startJob(projectId, {
        cutRegions,
        format,
        resolution,
        quality,
      });

      const newJobId = response.data.data.jobId;
      setJobId(newJobId);

      // Start SSE streaming for real-time progress
      const eventSource = exportApi.createJobStream(newJobId);

      eventSource.addEventListener('progress', (event) => {
        const data = JSON.parse(event.data);
        setProgress({
          percent: data.progress.percent,
          phase: data.progress.phase,
          currentOperation: data.progress.currentOperation,
          timeRemaining: data.progress.timeRemaining,
        });
      });

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data);
        setStatus('completed');
        setProgress({ percent: 100, phase: 'complete', currentOperation: 'Export complete!' });
        setDownloadUrl(data.outputUrl);
        eventSource.close();
      });

      eventSource.addEventListener('error', (event) => {
        try {
          const data = JSON.parse((event as any).data);
          setStatus('failed');
          setError(data.error || 'Export failed');
        } catch {
          setStatus('failed');
          setError('Connection lost during export');
        }
        eventSource.close();
      });

      eventSource.onerror = () => {
        // SSE connection error - fall back to polling
        eventSource.close();
        pollExportStatus(newJobId);
      };

    } catch (err: any) {
      setStatus('failed');
      setError(err.response?.data?.error || err.message || 'Failed to start export');
    }
  };

  // Polling fallback for SSE failures
  const pollExportStatus = async (pollJobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await exportApi.getJobStatus(pollJobId);
        const job = response.data.data;

        setProgress({
          percent: job.progress,
          phase: job.phase,
          currentOperation: job.currentOperation,
        });

        if (job.status === 'completed') {
          setStatus('completed');
          setDownloadUrl(job.outputUrl);
          clearInterval(pollInterval);
        } else if (job.status === 'failed') {
          setStatus('failed');
          setError(job.error || 'Export failed');
          clearInterval(pollInterval);
        } else if (job.status === 'cancelled') {
          setStatus('cancelled');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Poll error:', err);
        clearInterval(pollInterval);
        setStatus('failed');
        setError('Lost connection to export service');
      }
    }, 1000);

    // Cleanup on unmount
    return () => clearInterval(pollInterval);
  };

  // Cancel export
  const handleCancel = async () => {
    if (!jobId) return;

    try {
      await exportApi.cancelJob(jobId);
      setStatus('cancelled');
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  // Download exported file
  const handleDownload = async () => {
    if (!jobId) return;

    try {
      const response = await exportApi.download(jobId);
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${projectId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  };

  // Reset state on close
  const handleClose = () => {
    if (status === 'exporting') {
      // Confirm cancellation
      if (!confirm('Export in progress. Cancel and close?')) {
        return;
      }
      handleCancel();
    }
    setStatus('idle');
    setProgress({ percent: 0, phase: '', currentOperation: '' });
    setJobId(null);
    setError(null);
    setDownloadUrl(null);
    onClose();
  };

  // Format estimated time remaining
  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return '';
    if (seconds < 60) return `${Math.round(seconds)}s remaining`;
    return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s remaining`;
  };

  // Estimate file size
  const estimateFileSize = () => {
    const qualityMultiplier = { high: 1, medium: 0.6, low: 0.3 }[quality];
    const resolutionMultiplier = { '2160p': 4, '1080p': 1, '720p': 0.5, '480p': 0.25 }[resolution];
    const formatMultiplier = { mp4: 1, webm: 0.8, gif: 3 }[format];
    
    // Base estimate: 10MB per minute at 1080p high quality
    const durationMinutes = 1; // Would need actual duration
    const baseMB = 10 * durationMinutes;
    const estimatedMB = baseMB * qualityMultiplier * resolutionMultiplier * formatMultiplier;
    
    if (estimatedMB < 1) return `~${Math.round(estimatedMB * 1024)} KB`;
    if (estimatedMB > 1024) return `~${(estimatedMB / 1024).toFixed(1)} GB`;
    return `~${Math.round(estimatedMB)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Export Video</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {status === 'idle' ? (
          /* Export Options Form */
          <div className="space-y-6">
            {/* Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
              <div className="grid grid-cols-3 gap-2">
                {(['mp4', 'webm', 'gif'] as ExportFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      format === f
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {format === 'mp4' && 'Best compatibility, recommended for most uses'}
                {format === 'webm' && 'Smaller file size, good for web'}
                {format === 'gif' && 'Animated image, no audio'}
              </p>
            </div>

            {/* Resolution Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Resolution</label>
              <div className="grid grid-cols-4 gap-2">
                {(['2160p', '1080p', '720p', '480p'] as ExportResolution[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      resolution === r
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Quality</label>
              <div className="grid grid-cols-3 gap-2">
                {(['high', 'medium', 'low'] as ExportQuality[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`py-2 px-4 rounded-lg text-sm font-medium capitalize transition-colors ${
                      quality === q
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Cut Regions Info */}
            {getCutRegions().length > 0 && (
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-sm text-gray-300">
                  <span className="text-yellow-400">✂️</span> {getCutRegions().length} cut region(s) will be removed
                </p>
              </div>
            )}

            {/* Estimated Size */}
            <div className="text-sm text-gray-400">
              Estimated file size: {estimateFileSize()}
            </div>

            {/* Export Button */}
            <button
              onClick={handleStartExport}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Start Export
            </button>
          </div>
        ) : (
          /* Export Progress */
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
                <span className="flex items-center gap-2 text-yellow-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Export Cancelled
                </span>
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
                {progress.timeRemaining && (
                  <p className="text-xs text-gray-500 mt-2">
                    {formatTimeRemaining(progress.timeRemaining)}
                  </p>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {status === 'exporting' && (
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
              {status === 'completed' && (
                <>
                  <button
                    onClick={handleDownload}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Download
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
              {(status === 'failed' || status === 'cancelled') && (
                <>
                  <button
                    onClick={() => {
                      setStatus('idle');
                      setError(null);
                    }}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
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
