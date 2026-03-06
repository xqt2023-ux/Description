/**
 * Edit Executors
 *
 * Each executor receives intent parameters and returns cutRegions[].
 * All downstream pipeline (patch → transcript → VideoPlayer) is unified.
 */

import { spawn } from 'child_process';
import { getStoredTranscript } from './dubbing';

export interface CutRegion {
  startTime: number;
  endTime: number;
}

// ── Filler word list ───────────────────────────────────────────────────────

const DEFAULT_FILLERS = new Set([
  // Chinese
  '嗯', '啊', '哦', '哈', '那个', '就是', '然后', '对吧', '好吧', '这个',
  '就', '吧', '呢', '诶', '哎', '嘿',
  // English
  'um', 'uh', 'like', 'you know', 'so', 'basically', 'right', 'okay',
  'actually', 'literally',
]);

// ── Region merging ─────────────────────────────────────────────────────────

function mergeAdjacentRegions(regions: CutRegion[], gapThreshold: number): CutRegion[] {
  if (regions.length === 0) return [];

  const sorted = [...regions].sort((a, b) => a.startTime - b.startTime);
  const merged: CutRegion[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (Math.round((curr.startTime - last.endTime) * 1000) < Math.round(gapThreshold * 1000)) {
      last.endTime = Math.max(last.endTime, curr.endTime);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

// ── remove_fillers ─────────────────────────────────────────────────────────

export async function executeRemoveFillers(
  mediaId: string,
  customWords?: string[]
): Promise<CutRegion[]> {
  const transcript = getStoredTranscript(mediaId);
  if (!transcript) {
    throw new Error('请先转录视频');
  }

  const fillerSet = new Set(DEFAULT_FILLERS);
  if (customWords) {
    for (const w of customWords) fillerSet.add(w.toLowerCase());
  }

  const regions: CutRegion[] = [];

  for (const segment of transcript.segments ?? []) {
    for (const word of segment.words ?? []) {
      const normalized = word.text.trim().toLowerCase();
      if (fillerSet.has(normalized)) {
        regions.push({ startTime: word.startTime, endTime: word.endTime });
      }
    }
  }

  return mergeAdjacentRegions(regions, 0.1);
}

// ── cut_segment ────────────────────────────────────────────────────────────

export async function executeCutSegment(
  startTime: number,
  endTime: number
): Promise<CutRegion[]> {
  return [{ startTime, endTime }];
}

// ── FFmpeg stderr helpers ──────────────────────────────────────────────────

function runFFmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      // silencedetect and blackdetect write results to stderr even on exit code 1
      resolve(stderr);
    });
    proc.on('error', reject);
  });
}

export function parseSilenceOutput(stderr: string): CutRegion[] {
  const regions: CutRegion[] = [];
  let pendingStart: number | null = null;

  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      pendingStart = parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch && pendingStart !== null) {
      regions.push({ startTime: pendingStart, endTime: parseFloat(endMatch[1]) });
      pendingStart = null;
    }
  }

  return regions;
}

export function parseBlackDetectOutput(stderr: string): CutRegion[] {
  const regions: CutRegion[] = [];

  for (const line of stderr.split('\n')) {
    const match = line.match(/black_start:([\d.]+)\s+black_end:([\d.]+)/);
    if (match) {
      regions.push({ startTime: parseFloat(match[1]), endTime: parseFloat(match[2]) });
    }
  }

  return regions;
}

// ── remove_silence ─────────────────────────────────────────────────────────

export async function executeRemoveSilence(
  mediaFilePath: string,
  threshold = -40,
  minDuration = 0.5
): Promise<CutRegion[]> {
  const stderr = await runFFmpeg([
    '-i', mediaFilePath,
    '-af', `silencedetect=n=${threshold}dB:d=${minDuration}`,
    '-f', 'null', '-',
  ]);
  return parseSilenceOutput(stderr);
}

// ── remove_black_screens ────────────────────────────────────────────────────

export async function executeRemoveBlackScreens(
  mediaFilePath: string,
  minDuration = 0.5,
  threshold = 0.1
): Promise<CutRegion[]> {
  const stderr = await runFFmpeg([
    '-i', mediaFilePath,
    '-vf', `blackdetect=d=${minDuration}:pix_th=${threshold}`,
    '-f', 'null', '-',
  ]);
  return parseBlackDetectOutput(stderr);
}
