/**
 * Transcription Routes (T011, T012)
 * 
 * Endpoints:
 * - POST /api/transcriptions/start - Start transcription job
 * - GET /api/transcriptions/:id/status - Get job status (polling)
 * - GET /api/transcriptions/:id/stream - SSE stream for real-time updates
 * - GET /api/transcriptions/:id - Get completed transcript
 * - POST /api/transcriptions/:id/retry - Retry failed job
 * - POST /api/transcriptions/:id/cancel - Cancel in-progress job
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { 
  transcribeAudio, 
  TranscriptionResult, 
  extractAudioFromVideo, 
  isVideoFile, 
  isAudioFile,
  startTranscriptionJob,
  getTranscriptionJobStatus,
  registerSSEClient,
} from '../services/transcription';
import { jobStore, jobToResponse, canRetry, canCancel } from '../services/jobs';
import { Errors } from '../middleware/errorHandler';
import { Transcript } from '../../../shared/types';

const router = Router();

// In-memory storage (replace with database in production)
let transcriptions: any[] = [];

// Get the actual file path from URL
function getFilePathFromUrl(url: string): string {
  // URL format: /uploads/videos/filename.mp4 or http://localhost:3001/uploads/...
  const urlPath = url.replace(/^https?:\/\/[^/]+/, '');
  const relativePath = urlPath.replace(/^\//, '');
  return path.join(process.cwd(), relativePath);
}

// Create new transcription (start transcription job)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { mediaId, mediaUrl, language } = req.body;

    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID is required',
      });
    }

    const transcriptionId = uuidv4();
    
    // Create transcription record with pending status
    const transcription = {
      id: transcriptionId,
      mediaId,
      status: 'processing',
      progress: 0,
      language: language || 'auto',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      segments: [],
      text: '',
    };

    transcriptions.push(transcription);

    // Start real transcription in background
    (async () => {
      const index = transcriptions.findIndex(t => t.id === transcriptionId);
      if (index === -1) return;

      try {
        // Update progress
        transcriptions[index].progress = 10;

        // Get file path
        let filePath = '';
        if (mediaUrl) {
          filePath = getFilePathFromUrl(mediaUrl);
        } else {
          // If no URL provided, try to find by mediaId pattern
          const uploadsDir = path.join(process.cwd(), 'uploads');
          const videosDir = path.join(uploadsDir, 'videos');
          
          if (fs.existsSync(videosDir)) {
            const files = fs.readdirSync(videosDir);
            // Try to find a recently uploaded file
            if (files.length > 0) {
              // Sort by modification time, get the most recent
              const sortedFiles = files
                .map(f => ({
                  name: f,
                  time: fs.statSync(path.join(videosDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
              filePath = path.join(videosDir, sortedFiles[0].name);
            }
          }
        }

        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error(`Media file not found: ${filePath}`);
        }

        console.log(`Starting transcription for: ${filePath}`);
        transcriptions[index].progress = 20;

        // Check if OpenAI API key is configured
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY is not configured. Please set it in backend/.env file');
        }

        // If it's a video file, extract audio first
        let audioPath = filePath;
        if (isVideoFile(filePath)) {
          console.log('Detected video file, extracting audio...');
          transcriptions[index].progress = 25;
          
          const audioDir = path.join(process.cwd(), 'uploads', 'audio');
          const audioFilename = `${path.basename(filePath, path.extname(filePath))}_${Date.now()}.mp3`;
          audioPath = path.join(audioDir, audioFilename);
          
          try {
            await extractAudioFromVideo(filePath, audioPath);
            console.log('Audio extracted to:', audioPath);
          } catch (extractError: any) {
            console.error('Audio extraction failed:', extractError);
            throw new Error(`Failed to extract audio from video: ${extractError.message}. Make sure FFmpeg is installed on your system.`);
          }
        }

        // Call OpenAI Whisper API
        transcriptions[index].progress = 50;
        console.log('Calling OpenAI Whisper API...');
        const result: TranscriptionResult = await transcribeAudio(
          audioPath,
          language !== 'auto' ? language : undefined
        );

        transcriptions[index].progress = 90;

        // Clean up extracted audio file if we created one
        if (audioPath !== filePath && fs.existsSync(audioPath)) {
          try {
            fs.unlinkSync(audioPath);
            console.log('Cleaned up temporary audio file');
          } catch (e) {
            console.warn('Failed to clean up audio file:', e);
          }
        }

        // Transform segments to include speaker info
        const segments = result.segments.map((seg, idx) => ({
          ...seg,
          speakerId: 'speaker-1',
          speakerName: 'Speaker 1',
        }));

        // Update transcription with results
        transcriptions[index] = {
          ...transcriptions[index],
          status: 'completed',
          progress: 100,
          text: result.text,
          segments: segments,
          language: result.language,
          duration: result.duration,
          updatedAt: new Date().toISOString(),
        };

        console.log(`Transcription completed: ${result.text.substring(0, 100)}...`);
      } catch (error: any) {
        console.error('Transcription error:', error);
        transcriptions[index] = {
          ...transcriptions[index],
          status: 'error',
          progress: 0,
          error: error.message || 'Transcription failed',
          updatedAt: new Date().toISOString(),
        };
      }
    })();

    res.json({
      success: true,
      data: {
        id: transcriptionId,
        status: 'processing',
        message: 'Transcription started',
      },
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start transcription',
    });
  }
});

// Get transcription by ID
router.get('/:id', async (req: Request, res: Response) => {
  const transcription = transcriptions.find((t) => t.id === req.params.id);

  if (!transcription) {
    return res.status(404).json({
      success: false,
      error: 'Transcription not found',
    });
  }

  res.json({
    success: true,
    data: transcription,
  });
});

// Get transcription by media ID
router.get('/media/:mediaId', async (req: Request, res: Response) => {
  const transcription = transcriptions.find((t) => t.mediaId === req.params.mediaId);

  if (!transcription) {
    return res.status(404).json({
      success: false,
      error: 'Transcription not found for this media',
    });
  }

  res.json({
    success: true,
    data: transcription,
  });
});

// Update transcription
router.put('/:id', async (req: Request, res: Response) => {
  const index = transcriptions.findIndex((t) => t.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: 'Transcription not found',
    });
  }

  const { segments, text } = req.body;

  transcriptions[index] = {
    ...transcriptions[index],
    segments: segments || transcriptions[index].segments,
    text: text || transcriptions[index].text,
    updatedAt: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: transcriptions[index],
  });
});

// Delete transcription
router.delete('/:id', async (req: Request, res: Response) => {
  const index = transcriptions.findIndex((t) => t.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: 'Transcription not found',
    });
  }

  transcriptions.splice(index, 1);

  res.json({
    success: true,
    message: 'Transcription deleted',
  });
});

// ============================================
// Job-based Transcription Endpoints (T011, T012)
// ============================================

// In-memory job mapping (jobId -> transcription data)
const jobTranscriptMap: Map<string, any> = new Map();

/**
 * POST /api/transcriptions/start (T011)
 * Start a new transcription job
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mediaId, filePath, mediaUrl, language } = req.body;

    if (!mediaId) {
      throw Errors.validation('mediaId is required');
    }

    // Determine file path
    let actualFilePath = filePath;
    
    if (!actualFilePath && mediaUrl) {
      // Convert URL to file path
      const urlPath = mediaUrl.replace(/^https?:\/\/[^/]+/, '');
      const relativePath = urlPath.replace(/^\//, '');
      actualFilePath = path.join(process.cwd(), relativePath);
    }

    if (!actualFilePath || !fs.existsSync(actualFilePath)) {
      throw Errors.validation(`Media file not found: ${actualFilePath || 'no path provided'}`);
    }

    // Start transcription job
    const jobId = await startTranscriptionJob(mediaId, actualFilePath, language);

    res.status(202).json({
      success: true,
      data: {
        jobId,
        status: 'pending',
        message: 'Transcription job started',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/transcriptions/:id/status (T012)
 * Get transcription job status (for polling)
 */
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = getTranscriptionJobStatus(req.params.id);

    if (!job) {
      // Fall back to legacy transcriptions array
      const transcription = transcriptions.find((t) => t.id === req.params.id);
      if (transcription) {
        return res.json({
          success: true,
          data: {
            jobId: transcription.id,
            status: transcription.status === 'error' ? 'failed' : transcription.status,
            progress: transcription.progress || 0,
            result: transcription.status === 'completed' ? transcription : undefined,
            error: transcription.error,
          },
        });
      }
      throw Errors.notFound('Transcription job');
    }

    res.json({
      success: true,
      data: {
        ...jobToResponse(job),
        // Include result when completed
        result: job.status === 'completed' ? job.result : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/transcriptions/:id/stream (T010)
 * SSE stream for real-time transcription updates
 */
router.get('/:id/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id;
    const job = getTranscriptionJobStatus(jobId);

    if (!job) {
      throw Errors.notFound('Transcription job');
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Register client for updates
    const clientId = uuidv4();
    registerSSEClient(clientId, res, jobId);

    // Send current status immediately
    res.write(`event: transcript:status\n`);
    res.write(`data: ${JSON.stringify({
      jobId,
      status: job.status,
      progress: job.progress,
      result: job.status === 'completed' ? job.result : undefined,
      error: job.error,
    })}\n\n`);

    // If job is already completed or failed, close the connection
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      res.write(`event: close\n`);
      res.write(`data: {"reason": "job_${job.status}"}\n\n`);
      res.end();
    }

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(`:keepalive\n\n`);
    }, 30000);

    res.on('close', () => {
      clearInterval(keepAlive);
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transcriptions/:id/retry
 * Retry a failed transcription job
 */
router.post('/:id/retry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = getTranscriptionJobStatus(req.params.id);

    if (!job) {
      throw Errors.notFound('Transcription job');
    }

    if (!canRetry(job)) {
      throw Errors.validation(
        job.status !== 'failed'
          ? 'Only failed jobs can be retried'
          : 'Maximum retry attempts exceeded'
      );
    }

    const retriedJob = jobStore.retry(req.params.id);

    res.json({
      success: true,
      data: jobToResponse(retriedJob!),
      message: `Job queued for retry (attempt ${retriedJob!.retryCount}/${retriedJob!.maxRetries})`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transcriptions/:id/cancel
 * Cancel an in-progress transcription job
 */
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = getTranscriptionJobStatus(req.params.id);

    if (!job) {
      throw Errors.notFound('Transcription job');
    }

    if (!canCancel(job)) {
      throw Errors.validation(`Cannot cancel job with status '${job.status}'`);
    }

    const cancelledJob = jobStore.cancel(req.params.id);

    res.json({
      success: true,
      data: jobToResponse(cancelledJob!),
      message: 'Transcription job cancelled',
    });
  } catch (error) {
    next(error);
  }
});

export { router as transcriptionRoutes };
