/**
 * Transcription Enhancement Service
 * Uses Claude (via Babelark proxy or Anthropic direct) to add punctuation
 * to raw Whisper output (which often omits it for Chinese).
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Transcript, TranscriptSegment, Word } from '../../../shared/types';

export interface TranscriptionEnhancementResult {
  success: boolean;
  enhancedTranscript?: Transcript;
  error?: string;
}

/** Build an OpenAI-compatible client that works with Babelark or direct OpenAI */
function buildAIClient(): OpenAI | null {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  // Prefer Babelark (OpenAI-compatible Claude proxy) if configured
  if (process.env.BABELARK_API_KEY) {
    return new OpenAI({
      apiKey: process.env.BABELARK_API_KEY,
      baseURL: 'https://api.babelark.com/v1',
      httpAgent,
    } as any);
  }

  // Fall back to direct OpenAI API
  if (process.env.OPENAI_API_KEY) {
    const config: any = {
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent,
    };
    if (process.env.OPENAI_BASE_URL) config.baseURL = process.env.OPENAI_BASE_URL;
    return new OpenAI(config);
  }

  return null;
}

export async function enhanceTranscription(
  transcript: Transcript
): Promise<TranscriptionEnhancementResult> {
  const client = buildAIClient();
  if (!client) {
    return { success: true, enhancedTranscript: transcript };
  }

  try {
    // Collect all segment texts to check if punctuation is already present
    const fullText = transcript.segments.map(s => s.text).join('');
    const hasPunctuation = /[，。！？、；：]/.test(fullText);

    console.log(`[Enhancement] fullText sample: "${fullText.slice(0, 80)}"`);
    console.log(`[Enhancement] hasPunctuation=${hasPunctuation}`);

    if (hasPunctuation) {
      console.log('[Enhancement] Punctuation already present, distributing to words...');
      const enhancedSegments = transcript.segments.map(seg =>
        distributeSegmentPunctuationToWords(seg)
      );
      return { success: true, enhancedTranscript: { ...transcript, segments: enhancedSegments } };
    }

    // No punctuation — ask Claude to add it
    const model = process.env.BABELARK_MODEL || 'gpt-4o-mini';
    console.log(`[Enhancement] Adding punctuation via ${model}...`);

    const response = await client.chat.completions.create({
      model,
      max_tokens: Math.min(fullText.length * 3, 4096),
      messages: [{
        role: 'user',
        content: `以下是中文语音识别的转录文本，缺少标点符号。请为这段文字添加合适的中文标点符号（逗号、句号、问号、感叹号等），不要修改或删除任何文字，只添加标点。直接返回加标点后的文字，不需要任何解释或前缀。\n\n${fullText}`,
      }],
    });

    const punctuated = response.choices[0]?.message?.content?.trim() || fullText;

    console.log(`[Enhancement] Response sample: "${punctuated.slice(0, 100)}"`);
    console.log('[Enhancement] Punctuation added. Distributing to segments...');

    // Redistribute punctuated text back to segments and their word tokens
    const enhancedSegments = redistributeToSegments(transcript.segments, punctuated);

    return {
      success: true,
      enhancedTranscript: {
        ...transcript,
        segments: enhancedSegments,
      },
    };
  } catch (error: any) {
    console.warn('[Enhancement] Failed, returning original transcript:', error.message);
    console.warn('[Enhancement] Error stack:', error.stack?.split('\n').slice(0, 3).join(' | '));
    return { success: true, enhancedTranscript: transcript };
  }
}

/** Distribute punctuation from segment.text onto its word tokens */
function distributeSegmentPunctuationToWords(segment: TranscriptSegment): TranscriptSegment {
  if (!segment.words?.length) return segment;
  return {
    ...segment,
    words: attachTrailingPunctuation(segment.words, segment.text),
  };
}

/**
 * Given the Claude-punctuated full text, slice it per segment and distribute
 * punctuation onto each segment's word tokens.
 */
function redistributeToSegments(
  segments: TranscriptSegment[],
  punctuatedText: string
): TranscriptSegment[] {
  let remaining = punctuatedText.trim();

  return segments.map(seg => {
    const words = seg.words ?? [];
    if (!words.length) return seg;

    // Build this segment's portion of the punctuated text by consuming words
    const segWords = attachTrailingPunctuation(words, remaining);

    // Advance `remaining` past what we consumed
    remaining = advancePast(remaining, words);

    const segText = segWords.map(w => w.text).join('');
    return { ...seg, text: segText, words: segWords };
  });
}

/** Advance `remaining` past the characters that belong to these words */
function advancePast(remaining: string, words: Word[]): string {
  const puncRe = /^[，。！？、；：""''（）【】…—,.!?;:]+/;
  let r = remaining;
  for (const w of words) {
    const wText = w.text.trim();
    if (!wText) continue;
    const idx = r.indexOf(wText);
    if (idx === -1) continue;
    r = r.slice(idx + wText.length);
    const m = r.match(puncRe);
    if (m) r = r.slice(m[0].length);
  }
  return r;
}

/** Append any punctuation that immediately follows each word in the text */
function attachTrailingPunctuation(words: Word[], text: string): Word[] {
  const puncRe = /^[，。！？、；：""''（）【】…—,.!?;:]+/;
  const result: Word[] = [];
  let remaining = text.trim();

  for (let i = 0; i < words.length; i++) {
    const wText = words[i].text.trim();
    if (!wText) { result.push(words[i]); continue; }

    const idx = remaining.indexOf(wText);
    if (idx === -1) { result.push(words[i]); continue; }

    remaining = remaining.slice(idx + wText.length);

    const puncMatch = remaining.match(puncRe);
    const trailing = puncMatch ? puncMatch[0] : '';
    if (trailing) remaining = remaining.slice(trailing.length);

    result.push({ ...words[i], text: wText + trailing });
  }

  return result;
}
