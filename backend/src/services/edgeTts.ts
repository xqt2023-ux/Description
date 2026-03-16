/**
 * Edge TTS Service
 *
 * Wraps node-edge-tts (Microsoft Edge free TTS) to synthesize speech from text.
 * Saves audio as MP3 and optionally a word-level subtitle JSON sidecar.
 *
 * The Microsoft speech endpoint is bypassed via NO_PROXY in .env —
 * no proxy agent is passed so connections go direct.
 */

import { EdgeTTS } from 'node-edge-tts';
import fs from 'node:fs';

export interface TTSOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
}

export interface SubLine {
  part: string;
  start: number; // ms
  end: number;   // ms
}

export interface TTSResult {
  success: boolean;
  outputPath?: string;
  subtitles?: SubLine[];
  error?: string;
}

/**
 * Synthesize text to speech and save as MP3.
 *
 * @param text       The text to speak
 * @param outputPath Absolute path for the output .mp3 file
 * @param options    Optional voice/rate/pitch overrides
 */
export async function generateSpeech(
  text: string,
  outputPath: string,
  options: TTSOptions = {},
): Promise<TTSResult> {
  const tts = new EdgeTTS({
    voice: options.voice ?? 'zh-CN-XiaoyiNeural',
    lang: 'zh-CN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    saveSubtitles: true,
    rate: options.rate,
    pitch: options.pitch,
    // No proxy: the speech endpoint is listed in NO_PROXY in .env
  });

  try {
    await tts.ttsPromise(text, outputPath);

    // Read subtitle sidecar saved by node-edge-tts
    let subtitles: SubLine[] = [];
    const subPath = outputPath + '.json';
    if (fs.existsSync(subPath)) {
      try {
        subtitles = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
      } catch {
        // non-fatal — subtitles are a bonus
      }
    }

    return { success: true, outputPath, subtitles };
  } catch (err: any) {
    return { success: false, error: String(err) };
  }
}

export async function getVoices(): Promise<string[]> {
  // Commonly used Microsoft Edge TTS voices
  return [
    'zh-CN-XiaoyiNeural',
    'zh-CN-YunxiNeural',
    'zh-CN-XiaoxiaoNeural',
    'zh-CN-YunyangNeural',
    'en-US-JennyNeural',
    'en-US-GuyNeural',
  ];
}
