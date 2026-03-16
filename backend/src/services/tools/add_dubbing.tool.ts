/**
 * AI Dubbing Tool
 *
 * Synthesizes speech for the stored transcript using Microsoft Edge TTS,
 * then returns an add_dubbing TimelinePatch with the audio URL and subtitles.
 *
 * The audio file is saved to the exports directory and served via
 * GET /api/exports/download/:filename.
 */

import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { ToolDefinition } from '../toolRegistry';
import { getStoredTranscript } from '../dubbing';
import { generateSpeech } from '../edgeTts';

function getExportsDir(): string {
  const base = process.env.UPLOAD_DIR ?? './uploads';
  return path.join(base, 'exports');
}

const addDubbingTool: ToolDefinition = {
  name: 'add_dubbing',
  label: 'AI配音',
  category: 'audio',

  functionSchema: {
    type: 'function',
    function: {
      name: 'add_dubbing',
      description: '使用 AI 语音为视频配音，基于视频字幕合成语音',
      parameters: {
        type: 'object',
        properties: {
          voice: { type: 'string', description: '语音角色，默认 zh-CN-XiaoyiNeural' },
          text:  { type: 'string', description: '要朗读的文字，留空则使用视频字幕' },
        },
      },
    },
  },

  mcpSchema: {
    name: 'add_dubbing',
    description: '使用 AI 语音为视频配音',
    inputSchema: {
      type: 'object',
      properties: {
        mediaId: { type: 'string', description: '媒体文件 ID' },
        voice:   { type: 'string', description: '语音角色' },
        text:    { type: 'string', description: '要朗读的文字，留空则使用视频字幕' },
      },
      required: ['mediaId'],
    },
  },

  fallbackPattern: /配音|ai.?voice|tts|语音合成/i,
  fallbackParams: () => ({}),

  executePatch: async (params, ctx) => {
    // Determine text to synthesize
    let text: string = params.text ?? '';

    if (!text) {
      const transcript = getStoredTranscript(ctx.mediaId);
      if (!transcript) {
        throw new Error('未找到字幕，请先完成转录，或直接提供要配音的文字');
      }
      // Join all words from all segments
      text = (transcript.segments as any[])
        .flatMap((seg: any) => seg.words as any[])
        .filter((w: any) => !w.deleted)
        .map((w: any) => w.word ?? w.text ?? '')
        .join(' ')
        .trim();
    }

    if (!text) throw new Error('字幕内容为空，无法配音');

    // Generate speech
    const filename = `tts-${uuidv4()}.mp3`;
    const outputPath = path.join(getExportsDir(), filename);

    const result = await generateSpeech(text, outputPath, { voice: params.voice });
    if (!result.success) {
      throw new Error(`语音合成失败: ${result.error}`);
    }

    const audioUrl = `/api/exports/download/${filename}`;

    return {
      op: 'add_dubbing' as const,
      audioUrl,
      segments: result.subtitles ?? [],
    };
  },
};

export default addDubbingTool;
