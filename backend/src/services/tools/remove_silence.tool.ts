import { ToolDefinition } from '../toolRegistry';
import { executeRemoveSilence } from '../editExecutors';

const removeSilenceTool: ToolDefinition = {
  name: 'remove_silence',
  label: '去除静默段',
  category: 'cut',

  functionSchema: {
    type: 'function',
    function: {
      name: 'remove_silence',
      description: '自动检测并删除视频中的静默/停顿片段',
      parameters: {
        type: 'object',
        properties: {
          threshold:   { type: 'number', description: '静音阈值 dB，默认 -40' },
          minDuration: { type: 'number', description: '最短静默时长（秒），默认 0.5' },
        },
      },
    },
  },

  mcpSchema: {
    name: 'remove_silence',
    description: '自动检测并删除视频中的静默/停顿片段',
    inputSchema: {
      type: 'object',
      properties: {
        mediaId:     { type: 'string', description: '媒体文件 ID' },
        threshold:   { type: 'number', description: '静音阈值 dB，默认 -40' },
        minDuration: { type: 'number', description: '最短静默时长（秒），默认 0.5' },
      },
      required: ['mediaId'],
    },
  },

  fallbackPattern: /静[音默]|停顿|silence/i,
  fallbackParams: () => ({}),

  execute: (params, ctx) => {
    if (!ctx.mediaFilePath) throw new Error('媒体文件路径未知，无法检测静默');
    return executeRemoveSilence(ctx.mediaFilePath, params.threshold, params.minDuration);
  },
};

export default removeSilenceTool;
