import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Verify FFmpeg is installed and accessible
 * @returns FFmpeg version string if available, throws if not found
 */
export function verifyFFmpeg(): string {
  try {
    const output = execSync('ffmpeg -version', { encoding: 'utf-8' });
    const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    console.log(`✓ FFmpeg verified: version ${version}`);
    return version;
  } catch (error) {
    throw new Error(
      'FFmpeg is not installed or not accessible. Please install FFmpeg and ensure it is in your PATH.'
    );
  }
}

/**
 * Get FFmpeg capabilities
 */
export function getFFmpegCapabilities(): { encoders: string[]; decoders: string[] } {
  try {
    const encoderOutput = execSync('ffmpeg -encoders 2>&1', { encoding: 'utf-8' });
    const decoderOutput = execSync('ffmpeg -decoders 2>&1', { encoding: 'utf-8' });
    
    const encoders = ['libx264', 'aac', 'libvpx-vp9', 'libopus'].filter(enc => 
      encoderOutput.includes(enc)
    );
    const decoders = ['h264', 'aac', 'vp9', 'opus'].filter(dec => 
      decoderOutput.includes(dec)
    );
    
    return { encoders, decoders };
  } catch {
    return { encoders: [], decoders: [] };
  }
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
}

export interface ExportOptions {
  format: 'mp4' | 'webm' | 'gif';
  resolution: '2160p' | '1080p' | '720p' | '480p';
  quality: 'high' | 'medium' | 'low';
  audioCodec?: string;
  videoCodec?: string;
}

const resolutionMap = {
  '2160p': { width: 3840, height: 2160 },
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
};

export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');

      if (!videoStream) {
        return reject(new Error('No video stream found'));
      }

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: eval(videoStream.r_frame_rate || '0'),
        codec: videoStream.codec_name || '',
        bitrate: metadata.format.bit_rate || 0,
      });
    });
  });
}

export function exportVideo(
  inputPath: string,
  outputPath: string,
  options: ExportOptions,
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const resolution = resolutionMap[options.resolution];

    let command = ffmpeg(inputPath)
      .outputOptions('-movflags', 'faststart')
      .size(`${resolution.width}x${resolution.height}`);

    // Set quality presets
    if (options.quality === 'high') {
      command = command.videoBitrate('8000k').audioBitrate('320k');
    } else if (options.quality === 'medium') {
      command = command.videoBitrate('4000k').audioBitrate('192k');
    } else {
      command = command.videoBitrate('2000k').audioBitrate('128k');
    }

    // Set format-specific options
    if (options.format === 'mp4') {
      command = command.format('mp4').videoCodec('libx264').audioCodec('aac');
    } else if (options.format === 'webm') {
      command = command.format('webm').videoCodec('libvpx-vp9').audioCodec('libopus');
    }

    command
      .on('progress', (progress) => {
        if (onProgress && progress.percent) {
          onProgress(progress.percent);
        }
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .save(outputPath);
  });
}

export function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timestamp: number = 0
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x180',
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

export function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Timeline clip representation for export
 */
export interface ExportClip {
  id: string;
  sourceFile: string;
  startTime: number; // Start time in source file
  endTime: number;   // End time in source file
  trackType: 'video' | 'audio' | 'caption';
  position: number;  // Position on timeline
  duration: number;  // Duration on timeline
}

/**
 * Cut region representing deleted sections
 */
export interface CutRegion {
  startTime: number;
  endTime: number;
}

/**
 * Export configuration for timeline
 */
export interface TimelineExportConfig {
  sourceFile: string;
  cutRegions: CutRegion[];
  clips?: ExportClip[];
  options: ExportOptions;
  outputPath: string;
}

/**
 * Progress callback with detailed status
 */
export interface ExportProgress {
  percent: number;
  phase: 'analyzing' | 'processing' | 'encoding' | 'finalizing';
  currentOperation: string;
  timeRemaining?: number;
}

/**
 * T031: Export timeline with cut regions using FFmpeg filter complex
 * Supports progress tracking and respects timeline edits
 */
export function exportTimeline(
  config: TimelineExportConfig,
  onProgress?: (progress: ExportProgress) => void
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // Report initial progress
      onProgress?.({
        percent: 0,
        phase: 'analyzing',
        currentOperation: 'Analyzing source video...'
      });

      // Get source metadata
      const metadata = await getVideoMetadata(config.sourceFile);
      const totalDuration = metadata.duration;

      // Calculate segments to keep (inverse of cut regions)
      const segments = calculateKeepSegments(config.cutRegions, totalDuration);
      
      if (segments.length === 0) {
        return reject(new Error('No content remains after cuts - entire video was removed'));
      }

      onProgress?.({
        percent: 5,
        phase: 'processing',
        currentOperation: `Processing ${segments.length} segment(s)...`
      });

      // Build FFmpeg filter complex for seamless concatenation
      const { filterComplex, outputDuration } = buildFilterComplex(segments, metadata);
      
      const resolution = resolutionMap[config.options.resolution];
      
      // Calculate bitrates based on quality
      const videoBitrate = config.options.quality === 'high' ? '8000k' : 
                          config.options.quality === 'medium' ? '4000k' : '2000k';
      const audioBitrate = config.options.quality === 'high' ? '320k' :
                          config.options.quality === 'medium' ? '192k' : '128k';

      onProgress?.({
        percent: 10,
        phase: 'encoding',
        currentOperation: 'Starting video encoding...'
      });

      // Build FFmpeg command with filter complex
      let command = ffmpeg(config.sourceFile);

      // Apply filter complex for trimming and concatenating segments
      if (segments.length === 1) {
        // Simple case: single segment, just trim
        const seg = segments[0];
        command = command
          .setStartTime(seg.start)
          .setDuration(seg.end - seg.start);
      } else {
        // Multiple segments: use filter_complex to concatenate
        command = command.complexFilter(filterComplex, ['outv', 'outa']);
      }

      // Apply output settings
      command = command
        .outputOptions('-movflags', 'faststart')
        .size(`${resolution.width}x${resolution.height}`)
        .videoBitrate(videoBitrate)
        .audioBitrate(audioBitrate);

      // Set format-specific codecs
      if (config.options.format === 'mp4') {
        command = command.format('mp4').videoCodec('libx264').audioCodec('aac');
      } else if (config.options.format === 'webm') {
        command = command.format('webm').videoCodec('libvpx-vp9').audioCodec('libopus');
      }

      // Map outputs for filter_complex
      if (segments.length > 1) {
        command = command.outputOptions('-map', '[outv]', '-map', '[outa]');
      }

      const startTime = Date.now();

      command
        .on('start', (cmdline) => {
          console.log('FFmpeg command:', cmdline);
        })
        .on('progress', (progress) => {
          const percent = progress.percent ? Math.min(95, 10 + progress.percent * 0.85) : 10;
          const elapsed = (Date.now() - startTime) / 1000;
          const estimatedTotal = percent > 10 ? elapsed / (percent / 100) : undefined;
          const timeRemaining = estimatedTotal ? Math.max(0, estimatedTotal - elapsed) : undefined;

          onProgress?.({
            percent,
            phase: 'encoding',
            currentOperation: `Encoding: ${Math.round(percent)}%`,
            timeRemaining
          });
        })
        .on('end', () => {
          onProgress?.({
            percent: 100,
            phase: 'finalizing',
            currentOperation: 'Export complete!'
          });
          resolve(config.outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg export error:', err);
          reject(err);
        })
        .save(config.outputPath);

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate segments to keep (inverse of cut regions)
 * Merges overlapping cuts and returns non-cut segments
 */
function calculateKeepSegments(
  cutRegions: CutRegion[],
  totalDuration: number
): Array<{ start: number; end: number }> {
  if (cutRegions.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  // Sort and merge overlapping cut regions
  const sortedCuts = [...cutRegions].sort((a, b) => a.startTime - b.startTime);
  const mergedCuts: CutRegion[] = [];
  
  for (const cut of sortedCuts) {
    if (mergedCuts.length === 0) {
      mergedCuts.push({ ...cut });
    } else {
      const last = mergedCuts[mergedCuts.length - 1];
      if (cut.startTime <= last.endTime) {
        // Overlapping, merge
        last.endTime = Math.max(last.endTime, cut.endTime);
      } else {
        mergedCuts.push({ ...cut });
      }
    }
  }

  // Calculate keep segments (gaps between cuts)
  const segments: Array<{ start: number; end: number }> = [];
  let currentPos = 0;

  for (const cut of mergedCuts) {
    if (cut.startTime > currentPos) {
      segments.push({ start: currentPos, end: cut.startTime });
    }
    currentPos = cut.endTime;
  }

  // Add final segment if there's content after last cut
  if (currentPos < totalDuration) {
    segments.push({ start: currentPos, end: totalDuration });
  }

  return segments;
}

/**
 * Build FFmpeg filter_complex string for concatenating segments
 */
function buildFilterComplex(
  segments: Array<{ start: number; end: number }>,
  metadata: VideoMetadata
): { filterComplex: string; outputDuration: number } {
  if (segments.length <= 1) {
    const duration = segments.length === 1 ? segments[0].end - segments[0].start : 0;
    return { filterComplex: '', outputDuration: duration };
  }

  const filters: string[] = [];
  let outputDuration = 0;

  // Create trim filters for each segment
  segments.forEach((seg, i) => {
    const duration = seg.end - seg.start;
    outputDuration += duration;
    
    // Trim video
    filters.push(`[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`);
    // Trim audio
    filters.push(`[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`);
  });

  // Build concat inputs
  const videoInputs = segments.map((_, i) => `[v${i}]`).join('');
  const audioInputs = segments.map((_, i) => `[a${i}]`).join('');
  
  // Concatenate all segments
  filters.push(`${videoInputs}concat=n=${segments.length}:v=1:a=0[outv]`);
  filters.push(`${audioInputs}concat=n=${segments.length}:v=0:a=1[outa]`);

  return {
    filterComplex: filters.join(';'),
    outputDuration
  };
}

/**
 * Get estimated export duration based on segments
 */
export function getExportDuration(cutRegions: CutRegion[], totalDuration: number): number {
  const segments = calculateKeepSegments(cutRegions, totalDuration);
  return segments.reduce((total, seg) => total + (seg.end - seg.start), 0);
}
