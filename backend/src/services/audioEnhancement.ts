/**
 * Audio Enhancement Service (Studio Sound)
 *
 * Provides professional audio enhancement using FFmpeg filters:
 * - Noise reduction (afftdn - FFT denoiser)
 * - Loudness normalization (loudnorm)
 * - Dynamic range compression (compressor)
 * - Silence removal (silenceremove)
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

// ========================================
// Configuration
// ========================================

export interface AudioEnhancementOptions {
  noiseReduction?: boolean;      // Enable FFT denoiser (default: true)
  loudnessNorm?: boolean;         // Enable loudness normalization (default: true)
  compression?: boolean;          // Enable dynamic range compression (default: true)
  silenceRemoval?: boolean;       // Remove silence at start/end (default: false)
  noiseSensitivity?: number;      // Noise reduction sensitivity 0-1 (default: 0.5)
  targetLoudness?: number;        // Target loudness in LUFS (default: -16)
}

export interface AudioEnhancementResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  stats?: {
    processingTime: number;
    noiseReductionLevel: number;
    volumeAdjustment: number;
    provider: 'ffmpeg' | 'adobe' | 'local';
  };
}

const DEFAULT_OPTIONS: AudioEnhancementOptions = {
  noiseReduction: true,
  loudnessNorm: true,
  compression: true,
  silenceRemoval: false,
  noiseSensitivity: 0.5,
  targetLoudness: -16,
};

// ========================================
// Core Enhancement Functions
// ========================================

/**
 * Enhance audio using FFmpeg filters
 * Applies noise reduction, loudness normalization, and compression
 */
export async function enhanceAudio(
  inputPath: string,
  outputPath: string,
  options: AudioEnhancementOptions = {}
): Promise<AudioEnhancementResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Verify input file exists
    if (!fs.existsSync(inputPath)) {
      return {
        success: false,
        error: `Input file not found: ${inputPath}`,
      };
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Build audio filter chain
    const filters: string[] = [];

    // 1. Noise reduction using FFT denoiser
    if (opts.noiseReduction) {
      const nf = Math.floor(opts.noiseSensitivity! * 90) + 10; // Map 0-1 to 10-100
      filters.push(`afftdn=nf=${nf}:tn=1`);
    }

    // 2. Loudness normalization (EBU R128)
    if (opts.loudnessNorm) {
      filters.push(`loudnorm=I=${opts.targetLoudness}:TP=-1.5:LRA=11`);
    }

    // 3. Dynamic range compression
    if (opts.compression) {
      filters.push('acompressor=threshold=-18dB:ratio=3:attack=5:release=50');
    }

    // 4. Remove silence at start/end
    if (opts.silenceRemoval) {
      filters.push('silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB');
      filters.push('areverse');
      filters.push('silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB');
      filters.push('areverse');
    }

    const filterComplex = filters.join(',');

    console.log(`[AudioEnhancement] Applying filters: ${filterComplex}`);

    // Execute FFmpeg enhancement
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('192k');

      if (filterComplex) {
        command = command.audioFilters(filterComplex);
      }

      command
        .on('start', (cmdline) => {
          console.log('[AudioEnhancement] FFmpeg command:', cmdline);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[AudioEnhancement] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('[AudioEnhancement] Processing complete');
          resolve();
        })
        .on('error', (err) => {
          console.error('[AudioEnhancement] FFmpeg error:', err);
          reject(err);
        })
        .save(outputPath);
    });

    const processingTime = (Date.now() - startTime) / 1000;

    return {
      success: true,
      outputPath,
      stats: {
        processingTime,
        noiseReductionLevel: opts.noiseReduction ? Math.round(opts.noiseSensitivity! * 100) : 0,
        volumeAdjustment: opts.loudnessNorm ? opts.targetLoudness! : 0,
        provider: 'ffmpeg',
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Audio enhancement failed',
    };
  }
}

/**
 * Check if audio enhancement is enabled
 * Can be controlled via environment variable
 */
export function isAudioEnhancementEnabled(): boolean {
  return process.env.ENABLE_AUDIO_ENHANCEMENT === 'true';
}

/**
 * Generate enhanced audio file path
 */
export function getEnhancedAudioPath(inputPath: string): string {
  const ext = inputPath.lastIndexOf('.');
  if (ext === -1) return `${inputPath}_enhanced`;
  return `${inputPath.substring(0, ext)}_enhanced${inputPath.substring(ext)}`;
}
