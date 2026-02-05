import Groq from 'groq-sdk';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { v4 as uuidv4 } from 'uuid';
import { jobStore, Job } from './jobs';
import { Transcript, TranscriptSegment, Word } from '../../../shared/types';
import { storeTranscript } from './dubbing';

// Get proxy agent if configured
function getHttpAgent() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    console.log('Using proxy for API requests:', proxyUrl);
    return new HttpsProxyAgent(proxyUrl);
  }
  return undefined;
}

// Lazy initialization of clients
let groqClient: Groq | null = null;
let openaiClient: OpenAI | null = null;

// Reset clients (for testing)
export function resetClients(): void {
  groqClient = null;
  openaiClient = null;
}

function getGroqClient(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not configured. Please set it in backend/.env file');
    }
    const httpAgent = getHttpAgent();
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      httpAgent: httpAgent,
    });
  }
  return groqClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured. Please set it in backend/.env file');
    }
    
    const httpAgent = getHttpAgent();
    const config: any = {
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 180000,
      httpAgent: httpAgent,
    };
    
    if (process.env.OPENAI_BASE_URL) {
      config.baseURL = process.env.OPENAI_BASE_URL;
    }
    
    openaiClient = new OpenAI(config);
  }
  return openaiClient;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words: TranscriptionWord[];
}

export interface TranscriptionWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

// Use Groq's Whisper API (free and faster)
export async function transcribeAudioWithGroq(
  filePath: string,
  language?: string
): Promise<TranscriptionResult> {
  const groq = getGroqClient();
  const fileStream = fs.createReadStream(filePath);

  console.log('Using Groq Whisper API for transcription...');
  
  const response = await groq.audio.transcriptions.create({
    file: fileStream,
    model: 'whisper-large-v3',
    language: language,
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });

  // Debug: Log the response structure
  console.log('Groq response keys:', Object.keys(response as any));
  console.log('Groq response.words:', (response as any).words?.slice(0, 3));
  if ((response as any).segments?.length > 0) {
    console.log('First segment:', JSON.stringify((response as any).segments[0], null, 2));
  }

  // Groq may return words at the top level, not per segment
  const topLevelWords: any[] = (response as any).words || [];
  
  const segments: TranscriptionSegment[] = ((response as any).segments || []).map(
    (segment: any, index: number) => {
      // Get words from segment, or filter from top-level words
      let segmentWords = segment.words || [];
      
      if (segmentWords.length === 0 && topLevelWords.length > 0) {
        // Filter words that fall within this segment's time range
        segmentWords = topLevelWords.filter((word: any) => {
          const wordStart = word.start ?? word.startTime ?? 0;
          const segStart = segment.start ?? segment.startTime ?? 0;
          const segEnd = segment.end ?? segment.endTime ?? 0;
          return wordStart >= segStart && wordStart < segEnd;
        });
      }
      
      return {
        id: `segment-${index}`,
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        words: segmentWords.map((word: any) => ({
          text: word.word || word.text || '',
          startTime: word.start ?? word.startTime ?? 0,
          endTime: word.end ?? word.endTime ?? (word.start ?? 0) + 0.1,
          confidence: word.probability ?? word.confidence ?? 1,
        })),
      };
    }
  );

  return {
    text: response.text,
    segments,
    language: (response as any).language || 'unknown',
    duration: (response as any).duration || 0,
  };
}

// Use OpenAI's Whisper API (fallback)
export async function transcribeAudioWithOpenAI(
  filePath: string,
  language?: string
): Promise<TranscriptionResult> {
  const openai = getOpenAIClient();
  const fileStream = fs.createReadStream(filePath);

  console.log('Using OpenAI Whisper API for transcription...');
  
  const response = await openai.audio.transcriptions.create({
    file: fileStream,
    model: 'whisper-1',
    language: language,
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });

  const segments: TranscriptionSegment[] = (response.segments || []).map(
    (segment: any, index: number) => ({
      id: `segment-${index}`,
      text: segment.text,
      startTime: segment.start,
      endTime: segment.end,
      words: (segment.words || []).map((word: any) => ({
        text: word.word,
        startTime: word.start,
        endTime: word.end,
        confidence: word.probability || 1,
      })),
    })
  );

  return {
    text: response.text,
    segments,
    language: response.language || 'unknown',
    duration: response.duration || 0,
  };
}

// Main transcription function - tries Groq first, falls back to OpenAI
export async function transcribeAudio(
  filePath: string,
  language?: string
): Promise<TranscriptionResult> {
  // Try Groq first (free and faster)
  if (process.env.GROQ_API_KEY) {
    try {
      return await transcribeAudioWithGroq(filePath, language);
    } catch (error: any) {
      console.error('Groq transcription failed:', error.message);
      console.log('Falling back to OpenAI...');
    }
  }
  
  // Fall back to OpenAI
  if (process.env.OPENAI_API_KEY) {
    return await transcribeAudioWithOpenAI(filePath, language);
  }
  
  throw new Error('No transcription API configured. Please set GROQ_API_KEY or OPENAI_API_KEY in backend/.env');
}

export async function extractAudioFromVideo(
  videoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioChannels(1)
      .format('mp3')
      .on('start', (cmd) => {
        console.log('FFmpeg started:', cmd);
      })
      .on('progress', (progress) => {
        console.log('FFmpeg progress:', progress.percent?.toFixed(1) + '%');
      })
      .on('end', () => {
        console.log('Audio extraction completed:', outputPath);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(new Error(`Failed to extract audio: ${err.message}`));
      })
      .save(outputPath);
  });
}

// Check if file is a video
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'].includes(ext);
}

// Check if file is an audio
export function isAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'].includes(ext);
}

// ============================================
// Job-based Transcription (T009 enhancement)
// ============================================

export interface TranscriptionJobData {
  mediaId: string;
  filePath: string;
  language?: string;
}

/**
 * Start a transcription job
 * Returns the job ID for status polling
 */
export async function startTranscriptionJob(
  mediaId: string,
  filePath: string,
  language?: string
): Promise<string> {
  // Create job
  const job = jobStore.create<TranscriptionJobData>({
    type: 'transcription',
    data: { mediaId, filePath, language },
    maxRetries: 2,
  });

  // Start processing in background
  processTranscriptionJob(job.id).catch(err => {
    console.error(`Transcription job ${job.id} failed:`, err);
  });

  return job.id;
}

/**
 * Process a transcription job
 */
async function processTranscriptionJob(jobId: string): Promise<void> {
  const job = jobStore.get<TranscriptionJobData>(jobId);
  if (!job) return;

  try {
    // Update status to processing
    jobStore.update(jobId, { status: 'processing', progress: 10 });

    const { mediaId, filePath, language } = job.data;
    let audioPath = filePath;

    // Extract audio if video
    if (isVideoFile(filePath)) {
      jobStore.update(jobId, { progress: 20 });
      const audioDir = path.join(path.dirname(filePath), '..', 'audio');
      audioPath = path.join(audioDir, `${path.basename(filePath, path.extname(filePath))}.mp3`);
      await extractAudioFromVideo(filePath, audioPath);
    }

    jobStore.update(jobId, { progress: 40 });

    // Transcribe
    const result = await transcribeAudio(audioPath, language);

    jobStore.update(jobId, { progress: 80 });

    // Convert to Transcript type with word indices
    const transcript = convertToTranscript(mediaId, result);

    jobStore.update(jobId, { progress: 90 });

    // Store transcript for dubbing workflow
    storeTranscript(mediaId, transcript);
    console.log(`[Transcription] Stored transcript for dubbing, mediaId: ${mediaId}`);

    // Complete
    jobStore.update(jobId, {
      status: 'completed',
      progress: 100,
      result: transcript,
    });

    // Clean up extracted audio if we created it
    if (audioPath !== filePath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

  } catch (error: any) {
    console.error(`Transcription job ${jobId} error:`, error);
    jobStore.update(jobId, {
      status: 'failed',
      error: error.message || 'Transcription failed',
    });
  }
}

/**
 * Convert TranscriptionResult to Transcript with word indices
 */
function convertToTranscript(mediaId: string, result: TranscriptionResult): Transcript {
  const segments: TranscriptSegment[] = result.segments.map((seg, segIndex) => ({
    id: seg.id || uuidv4(),
    text: seg.text,
    startTime: seg.startTime,
    endTime: seg.endTime,
    words: seg.words.map((word, wordIndex) => ({
      text: word.text,
      startTime: word.startTime,
      endTime: word.endTime,
      confidence: word.confidence,
      index: wordIndex, // Add index for text-driven editing
      deleted: false,
    })),
  }));

  return {
    id: uuidv4(),
    mediaId,
    language: result.language,
    segments,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get transcription job status
 */
export function getTranscriptionJobStatus(jobId: string) {
  return jobStore.get(jobId);
}

// ============================================
// SSE Streaming Support (T010)
// ============================================

import { Response } from 'express';

export interface SSEClient {
  id: string;
  res: Response;
  jobId: string;
}

const sseClients: Map<string, SSEClient> = new Map();

/**
 * Register an SSE client for job updates
 */
export function registerSSEClient(clientId: string, res: Response, jobId: string): void {
  sseClients.set(clientId, { id: clientId, res, jobId });
  
  // Send initial connection event
  sendSSEEvent(res, 'connected', { clientId, jobId });
  
  // Clean up on client disconnect
  res.on('close', () => {
    sseClients.delete(clientId);
  });
}

/**
 * Send SSE event to a specific client
 */
function sendSSEEvent(res: Response, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Broadcast job update to all listening clients
 */
export function broadcastJobUpdate(jobId: string, eventType: string, data: any): void {
  for (const client of sseClients.values()) {
    if (client.jobId === jobId) {
      sendSSEEvent(client.res, eventType, data);
    }
  }
}

// Subscribe to job updates and broadcast via SSE
jobStore.on('job:updated', (job: Job) => {
  if (job.type === 'transcription') {
    broadcastJobUpdate(job.id, 'transcript:progress', {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
    });
    
    // Send result when completed
    if (job.status === 'completed' && job.result) {
      broadcastJobUpdate(job.id, 'transcript:complete', {
        jobId: job.id,
        transcript: job.result,
      });
    }
    
    // Send error when failed
    if (job.status === 'failed') {
      broadcastJobUpdate(job.id, 'transcript:error', {
        jobId: job.id,
        error: job.error,
        canRetry: job.retryCount < job.maxRetries,
      });
    }
  }
});
