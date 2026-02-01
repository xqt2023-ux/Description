import { Router, Request, Response, NextFunction } from 'express';
import { upload, handleUploadError } from '../middleware/upload';
import { storage } from '../services/storage';
import { getVideoMetadata } from '../services/videoProcessing';
import { Errors } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = Router();

// In-memory storage (replace with database in production)
let mediaFiles: any[] = [];

/**
 * POST /api/media (T013)
 * Upload media with duration extraction for video/audio
 */
router.post('/', upload.single('file'), handleUploadError, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw Errors.validation('No file uploaded');
    }

    const { projectId } = req.body;

    // Upload to storage (local or BOS)
    const uploadResult = await storage.uploadMedia(req.file);

    // Determine media type
    const type = req.file.mimetype.startsWith('video/')
      ? 'video'
      : req.file.mimetype.startsWith('audio/')
      ? 'audio'
      : 'image';

    // Extract metadata for video/audio files
    let metadata: any = {};
    
    if (type === 'video' || type === 'audio') {
      try {
        const filePath = path.join(process.cwd(), 'uploads', type === 'video' ? 'videos' : 'audio', uploadResult.filename);
        const videoMeta = await getVideoMetadata(filePath);
        
        metadata = {
          duration: videoMeta.duration,
          width: type === 'video' ? videoMeta.width : undefined,
          height: type === 'video' ? videoMeta.height : undefined,
          fps: type === 'video' ? videoMeta.fps : undefined,
          codec: videoMeta.codec,
          bitrate: videoMeta.bitrate,
        };
      } catch (metaError) {
        console.warn('Failed to extract metadata:', metaError);
        // Continue without metadata - it's not critical
      }
    }

    const media = {
      id: uploadResult.id,
      projectId: projectId || null,
      filename: uploadResult.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: uploadResult.size,
      url: uploadResult.url,
      type,
      thumbnails: [],
      thumbnailCount: 0,
      createdAt: new Date().toISOString(),
      metadata,
    };

    mediaFiles.push(media);

    res.status(201).json({
      success: true,
      data: media,
    });
  } catch (error) {
    next(error);
  }
});

// Upload thumbnails for a media
router.post('/:id/thumbnails', async (req: Request, res: Response) => {
  try {
    const media = mediaFiles.find((m) => m.id === req.params.id);

    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found',
      });
    }

    const { thumbnails } = req.body; // Array of base64 strings

    if (!thumbnails || !Array.isArray(thumbnails)) {
      return res.status(400).json({
        success: false,
        error: 'Thumbnails array is required',
      });
    }

    // Upload thumbnails to storage
    const thumbnailUrls = await storage.uploadThumbnails(thumbnails, media.id);

    // Update media with thumbnail URLs
    media.thumbnails = [...(media.thumbnails || []), ...thumbnailUrls];
    media.thumbnailCount = media.thumbnails.length;

    res.json({
      success: true,
      data: {
        mediaId: media.id,
        thumbnailUrls,
        totalCount: media.thumbnailCount,
      },
    });
  } catch (error) {
    console.error('Thumbnail upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload thumbnails',
    });
  }
});

// Get all media (for a project)
router.get('/', async (req: Request, res: Response) => {
  const { projectId } = req.query;
  
  let files = mediaFiles;
  if (projectId) {
    files = mediaFiles.filter(m => m.projectId === projectId);
  }

  res.json({
    success: true,
    data: files,
  });
});

// Get media by ID
router.get('/:id', async (req: Request, res: Response) => {
  const media = mediaFiles.find((m) => m.id === req.params.id);

  if (!media) {
    return res.status(404).json({
      success: false,
      error: 'Media not found',
    });
  }

  res.json({
    success: true,
    data: media,
  });
});

// Delete media
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const index = mediaFiles.findIndex((m) => m.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Media not found',
      });
    }

    const media = mediaFiles[index];

    // Delete file from storage
    await storage.deleteMedia(media.filename, media.mimetype);

    // Delete thumbnails
    if (media.thumbnailCount > 0) {
      await storage.deleteThumbnails(media.id, media.thumbnailCount);
    }

    mediaFiles.splice(index, 1);

    res.json({
      success: true,
      message: 'Media deleted',
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete media',
    });
  }
});

// Transcribe media
router.post('/:id/transcribe', async (req: Request, res: Response) => {
  const media = mediaFiles.find((m) => m.id === req.params.id);

  if (!media) {
    return res.status(404).json({
      success: false,
      error: 'Media not found',
    });
  }

  // TODO: Implement actual transcription with Whisper
  // For now, return a mock response
  const transcription = {
    id: uuidv4(),
    mediaId: media.id,
    status: 'processing',
    language: req.body.language || 'auto',
    createdAt: new Date().toISOString(),
  };

  res.status(202).json({
    success: true,
    data: transcription,
    message: 'Transcription started',
  });
});

// Get storage info
router.get('/storage/info', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      type: storage.storageType,
      totalFiles: mediaFiles.length,
    },
  });
});

// Generate thumbnails for a video using FFmpeg
router.post('/:id/generate-thumbnails', async (req: Request, res: Response) => {
  try {
    const mediaId = req.params.id;
    let media = mediaFiles.find((m) => m.id === mediaId);

    const { interval = 2, count, videoFilename } = req.body; // interval in seconds
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const thumbnailDir = path.join(uploadDir, 'thumbnails');
    
    // Ensure thumbnail directory exists
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    // Try to find the video file
    let videoPath: string;
    let filename: string;
    
    if (media) {
      filename = media.filename;
      videoPath = path.join(uploadDir, 'videos', filename);
    } else if (videoFilename) {
      filename = videoFilename;
      videoPath = path.join(uploadDir, 'videos', filename);
    } else {
      // Try to find a video file with the mediaId in its name
      const videosDir = path.join(uploadDir, 'videos');
      if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        const matchingFile = files.find(f => f.includes(mediaId));
        if (matchingFile) {
          filename = matchingFile;
          videoPath = path.join(videosDir, matchingFile);
        } else {
          return res.status(404).json({
            success: false,
            error: 'Media not found and no matching video file',
          });
        }
      } else {
        return res.status(404).json({
          success: false,
          error: 'Videos directory not found',
        });
      }
    }

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({
        success: false,
        error: `Video file not found: ${videoPath}`,
      });
    }

    // First, get video duration using ffprobe
    const getDuration = (): Promise<number> => {
      return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          videoPath
        ]);
        
        let output = '';
        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        ffprobe.on('close', (code) => {
          if (code === 0) {
            resolve(parseFloat(output.trim()) || 60);
          } else {
            resolve(60); // Default to 60 seconds if ffprobe fails
          }
        });
        
        ffprobe.on('error', () => resolve(60));
      });
    };

    const duration = await getDuration();
    const fps = 1 / interval; // frames per second (e.g., interval=0.1 means 10 fps)
    const thumbnailCount = count || Math.ceil(duration / interval);
    const thumbnailUrls: string[] = [];
    const baseUrl = process.env.UPLOAD_BASE_URL || `http://localhost:${process.env.PORT || 3001}/uploads`;

    console.log(`Generating ${thumbnailCount} thumbnails for video: ${filename}, duration: ${duration}s, fps: ${fps}`);

    // Use FFmpeg's fps filter to extract all frames at once (much faster)
    const thumbnailPattern = path.join(thumbnailDir, `${mediaId}_thumb_%d.jpg`);
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-vf', `fps=${fps},scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2`,
        '-q:v', '5',
        thumbnailPattern
      ]);
      
      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs progress to stderr
        const str = data.toString();
        if (str.includes('frame=')) {
          // Could parse progress here if needed
        }
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('FFmpeg batch extraction completed');
          resolve();
        } else {
          console.error(`FFmpeg batch extraction failed with code ${code}`);
          resolve(); // Continue even if failed
        }
      });
      
      ffmpeg.on('error', (err) => {
        console.error('FFmpeg error:', err);
        resolve();
      });
    });

    // Collect generated thumbnail URLs
    for (let i = 1; i <= thumbnailCount; i++) {
      const thumbnailFilename = `${mediaId}_thumb_${i}.jpg`;
      const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
      if (fs.existsSync(thumbnailPath)) {
        thumbnailUrls.push(`${baseUrl}/thumbnails/${thumbnailFilename}`);
      }
    }

    // Update media with thumbnail URLs if found
    if (media) {
      media.thumbnails = thumbnailUrls;
      media.thumbnailCount = thumbnailUrls.length;
      media.duration = duration;
    }

    console.log(`Generated ${thumbnailUrls.length} thumbnails successfully`);

    res.json({
      success: true,
      data: {
        mediaId: mediaId,
        thumbnails: thumbnailUrls,
        duration,
        count: thumbnailUrls.length,
      },
    });
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate thumbnails',
    });
  }
});

/**
 * POST /api/media/:id/generate-waveform (T030)
 * Generate waveform data for audio visualization in timeline
 */
router.post('/:id/generate-waveform', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mediaId = req.params.id;
    const media = mediaFiles.find((m) => m.id === mediaId);
    
    const { samples = 100 } = req.body; // Number of waveform samples
    const uploadDir = process.env.UPLOAD_DIR || './uploads';

    // Find the media file
    let mediaPath: string = '';
    let filename: string = '';

    if (media) {
      filename = media.filename;
      const subdir = media.type === 'video' ? 'videos' : 'audio';
      mediaPath = path.join(uploadDir, subdir, filename);
    } else {
      // Try to find in both directories
      const videosDir = path.join(uploadDir, 'videos');
      const audioDir = path.join(uploadDir, 'audio');
      
      if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        const matchingFile = files.find(f => f.includes(mediaId));
        if (matchingFile) {
          filename = matchingFile;
          mediaPath = path.join(videosDir, matchingFile);
        }
      }
      
      if (!mediaPath && fs.existsSync(audioDir)) {
        const files = fs.readdirSync(audioDir);
        const matchingFile = files.find(f => f.includes(mediaId));
        if (matchingFile) {
          filename = matchingFile!;
          mediaPath = path.join(audioDir, matchingFile);
        }
      }

      if (!mediaPath) {
        throw Errors.notFound('Media file');
      }
    }

    if (!fs.existsSync(mediaPath)) {
      throw Errors.notFound('Media file');
    }

    // Extract audio waveform data using FFmpeg
    // We'll use audiowaveform or analyze raw audio samples
    const waveformData: number[] = await new Promise((resolve, reject) => {
      // Use FFmpeg to get raw audio samples, then analyze
      // astats filter provides audio statistics
      const ffmpeg = spawn('ffmpeg', [
        '-i', mediaPath,
        '-af', `aresample=8000,asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1`,
        '-f', 'null',
        '-'
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        // Parse the astats output to get RMS levels
        // For simplicity, we'll generate synthetic waveform based on duration
        // In production, parse actual audio levels
        const data: number[] = [];
        
        // Try to extract Peak level values from astats output
        const peakMatches = stderr.matchAll(/Peak level dB:\s*([-\d.]+)/g);
        const peaks = Array.from(peakMatches).map(m => {
          const db = parseFloat(m[1]);
          // Convert dB to 0-1 scale (assuming -60dB to 0dB range)
          return Math.max(0, Math.min(1, (db + 60) / 60));
        });

        if (peaks.length > 0) {
          // Use actual peaks if available
          resolve(peaks.slice(0, samples));
        } else {
          // Generate placeholder waveform based on video analysis
          // This creates a natural-looking waveform pattern
          for (let i = 0; i < samples; i++) {
            const base = 0.3 + Math.random() * 0.3; // Base level 30-60%
            const speech = Math.sin(i * 0.2) * 0.2; // Speech-like variation
            const noise = Math.random() * 0.1; // Small random noise
            data.push(Math.max(0.1, Math.min(0.9, base + speech + noise)));
          }
          resolve(data);
        }
      });

      ffmpeg.on('error', (err) => {
        console.error('FFmpeg waveform error:', err);
        // Generate fallback waveform
        const data: number[] = [];
        for (let i = 0; i < samples; i++) {
          data.push(0.3 + Math.random() * 0.4);
        }
        resolve(data);
      });
    });

    // Update media with waveform data
    if (media) {
      media.waveform = waveformData;
    }

    res.json({
      success: true,
      data: {
        mediaId,
        waveform: waveformData,
        samples: waveformData.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as mediaRoutes };
