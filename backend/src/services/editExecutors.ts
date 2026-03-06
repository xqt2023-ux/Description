/**
 * Edit Executors
 *
 * Each executor receives intent parameters and returns cutRegions[].
 * All downstream pipeline (patch → transcript → VideoPlayer) is unified.
 */

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
