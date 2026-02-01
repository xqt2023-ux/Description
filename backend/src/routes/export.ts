import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { 
  exportTimeline, 
  getExportDuration, 
  ExportOptions, 
  CutRegion, 
  ExportProgress 
} from '../services/videoProcessing';
import { storage } from '../services/storage';
import { Errors } from '../middleware/errorHandler';

const router = Router();

// Export job status types
type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface ExportJob {
  id: string;
  projectId: string;
  sourceFile: string;
  cutRegions: CutRegion[];
  format: 'mp4' | 'webm' | 'gif';
  resolution: '2160p' | '1080p' | '720p' | '480p';
  quality: 'high' | 'medium' | 'low';
  status: ExportStatus;
  progress: number;
  phase: string;
  currentOperation: string;
  estimatedDuration: number;
  outputPath: string | null;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// In-memory job storage
const exportJobs = new Map<string, ExportJob>();

// Event emitter for SSE broadcasting
const exportEvents = new EventEmitter();

// Cleanup completed jobs after 1 hour
const JOB_TTL_MS = 60 * 60 * 1000;

/**
 * POST /api/export/start (T032)
 * Start a new export job with FFmpeg
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      projectId, 
      sourceFile, 
      cutRegions = [], 
      format = 'mp4', 
      resolution = '1080p', 
      quality = 'high' 
    } = req.body;

    if (!projectId) {
      throw Errors.validation('Project ID is required');
    }

    // Try to get project data from storage
    let project: any = null;
    let mediaPath: string = '';
    let cuts: CutRegion[] = cutRegions;

    try {
      // Note: loadProject not implemented yet, use null for now
      project = null; // TODO: implement storage.loadProject(projectId)
      if (project && project.mediaFile) {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        mediaPath = path.join(uploadDir, 'videos', project.mediaFile);
      }

      // If project has transcript with deleted words, derive cut regions
      if (project?.transcript?.words && cuts.length === 0) {
        cuts = deriveRegionsFromDeletedWords(project.transcript.words);
      }
    } catch {
      // Project not found in storage, use provided sourceFile
    }

    // Use provided sourceFile if no project media
    if (!mediaPath && sourceFile) {
      mediaPath = sourceFile;
    }

    if (!mediaPath || !fs.existsSync(mediaPath)) {
      throw Errors.validation('Source media file not found');
    }

    // Create export job
    const jobId = uuidv4();
    const exportsDir = process.env.UPLOAD_DIR 
      ? path.join(process.env.UPLOAD_DIR, 'exports')
      : './uploads/exports';
    
    // Ensure exports directory exists
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const outputFilename = `${jobId}.${format}`;
    const outputPath = path.join(exportsDir, outputFilename);

    const job: ExportJob = {
      id: jobId,
      projectId,
      sourceFile: mediaPath,
      cutRegions: cuts,
      format,
      resolution,
      quality,
      status: 'pending',
      progress: 0,
      phase: 'pending',
      currentOperation: 'Queued for processing',
      estimatedDuration: 0,
      outputPath: null,
      outputUrl: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    exportJobs.set(jobId, job);

    // Start export asynchronously
    processExportJob(jobId);

    res.status(202).json({
      success: true,
      data: {
        jobId,
        status: job.status,
        message: 'Export job started',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/export/:id/status (T033)
 * Get export job status for polling
 */
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id;
    const job = exportJobs.get(jobId);

    if (!job) {
      throw Errors.notFound('Export job');
    }

    res.json({
      success: true,
      data: {
        jobId: job.id,
        projectId: job.projectId,
        status: job.status,
        progress: job.progress,
        phase: job.phase,
        currentOperation: job.currentOperation,
        estimatedDuration: job.estimatedDuration,
        format: job.format,
        resolution: job.resolution,
        quality: job.quality,
        outputUrl: job.outputUrl,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/export/:id/stream
 * SSE stream for real-time export progress
 */
router.get('/:id/stream', async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const job = exportJobs.get(jobId);

  if (!job) {
    res.status(404).json({ success: false, error: 'Export job not found' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial state
  sendSSE(res, 'status', {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    currentOperation: job.currentOperation,
  });

  // Listen for job updates
  const onProgress = (data: { jobId: string; progress: ExportProgress }) => {
    if (data.jobId === jobId) {
      sendSSE(res, 'progress', data);
    }
  };

  const onComplete = (data: { jobId: string; outputUrl: string }) => {
    if (data.jobId === jobId) {
      sendSSE(res, 'complete', data);
      cleanup();
    }
  };

  const onError = (data: { jobId: string; error: string }) => {
    if (data.jobId === jobId) {
      sendSSE(res, 'error', data);
      cleanup();
    }
  };

  exportEvents.on('progress', onProgress);
  exportEvents.on('complete', onComplete);
  exportEvents.on('error', onError);

  // Cleanup on client disconnect
  const cleanup = () => {
    exportEvents.off('progress', onProgress);
    exportEvents.off('complete', onComplete);
    exportEvents.off('error', onError);
  };

  req.on('close', cleanup);
});

/**
 * GET /api/export/:id/download (T034)
 * Download completed export
 */
router.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id;
    const job = exportJobs.get(jobId);

    if (!job) {
      throw Errors.notFound('Export job');
    }

    if (job.status !== 'completed') {
      throw Errors.validation('Export not ready for download. Current status: ' + job.status);
    }

    if (!job.outputPath || !fs.existsSync(job.outputPath)) {
      throw Errors.notFound('Export file');
    }

    const filename = `export_${job.projectId}_${Date.now()}.${job.format}`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', job.format === 'mp4' ? 'video/mp4' : 
                                  job.format === 'webm' ? 'video/webm' : 'image/gif');

    const stream = fs.createReadStream(job.outputPath);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/export/:id/cancel
 * Cancel an in-progress export
 */
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id;
    const job = exportJobs.get(jobId);

    if (!job) {
      throw Errors.notFound('Export job');
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw Errors.validation('Cannot cancel a ' + job.status + ' job');
    }

    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();

    // Emit cancellation event
    exportEvents.emit('error', {
      jobId,
      error: 'Export cancelled by user',
    });

    res.json({
      success: true,
      message: 'Export job cancelled',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Process export job asynchronously
 */
async function processExportJob(jobId: string): Promise<void> {
  const job = exportJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'processing';
    job.startedAt = new Date().toISOString();

    const exportsDir = process.env.UPLOAD_DIR 
      ? path.join(process.env.UPLOAD_DIR, 'exports')
      : './uploads/exports';
    
    const outputPath = path.join(exportsDir, `${jobId}.${job.format}`);

    // Export with progress tracking
    await exportTimeline(
      {
        sourceFile: job.sourceFile,
        cutRegions: job.cutRegions,
        options: {
          format: job.format,
          resolution: job.resolution,
          quality: job.quality,
        },
        outputPath,
      },
      (progress: ExportProgress) => {
        // Check if job was cancelled
        const currentJob = exportJobs.get(jobId);
        if (currentJob?.status === 'cancelled') {
          throw new Error('Export cancelled');
        }

        // Update job state
        job.progress = progress.percent;
        job.phase = progress.phase;
        job.currentOperation = progress.currentOperation;

        // Emit progress event for SSE
        exportEvents.emit('progress', {
          jobId,
          progress: {
            percent: progress.percent,
            phase: progress.phase,
            currentOperation: progress.currentOperation,
            timeRemaining: progress.timeRemaining,
          },
        });
      }
    );

    // Mark complete
    job.status = 'completed';
    job.progress = 100;
    job.outputPath = outputPath;
    job.outputUrl = `/api/export/${jobId}/download`;
    job.completedAt = new Date().toISOString();

    // Emit completion event
    exportEvents.emit('complete', {
      jobId,
      outputUrl: job.outputUrl,
    });

    // Schedule cleanup
    setTimeout(() => {
      const j = exportJobs.get(jobId);
      if (j) {
        // Delete the file if it exists
        if (j.outputPath && fs.existsSync(j.outputPath)) {
          fs.unlinkSync(j.outputPath);
        }
        exportJobs.delete(jobId);
      }
    }, JOB_TTL_MS);

  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
    job.completedAt = new Date().toISOString();

    // Emit error event
    exportEvents.emit('error', {
      jobId,
      error: job.error,
    });
  }
}

/**
 * Derive cut regions from words marked as deleted
 */
function deriveRegionsFromDeletedWords(words: Array<{ start: number; end: number; deleted?: boolean }>): CutRegion[] {
  const regions: CutRegion[] = [];
  let regionStart: number | null = null;

  for (const word of words) {
    if (word.deleted) {
      if (regionStart === null) {
        regionStart = word.start;
      }
    } else {
      if (regionStart !== null) {
        // Find the end of the previous deleted word
        const lastDeletedIndex = words.indexOf(word) - 1;
        if (lastDeletedIndex >= 0) {
          regions.push({
            startTime: regionStart,
            endTime: words[lastDeletedIndex].end,
          });
        }
        regionStart = null;
      }
    }
  }

  // Handle trailing deleted words
  if (regionStart !== null && words.length > 0) {
    const lastWord = words[words.length - 1];
    if (lastWord.deleted) {
      regions.push({
        startTime: regionStart,
        endTime: lastWord.end,
      });
    }
  }

  return regions;
}

/**
 * Helper to send SSE events
 */
function sendSSE(res: Response, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Legacy endpoints for backward compatibility
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  // Forward to /start handler
  const { projectId, sourceFile, cutRegions, format, resolution, quality } = req.body;
  req.body = { projectId, sourceFile, cutRegions, format, resolution, quality };
  next('route'); // Skip to next matching route
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  // Forward to /status handler by redirecting
  res.redirect(307, `/api/export/${req.params.id}/status`);
});

export { router as exportRoutes };
