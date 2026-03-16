import { ToolDefinition } from '../toolRegistry';
import { executeRemoveBlackScreens } from '../editExecutors';

const removeBlackScreensTool: ToolDefinition = {
  name: 'remove_black_screens',
  label: '去除黑屏',
  category: 'cut',

  functionSchema: {
    type: 'function',
    function: {
      name: 'remove_black_screens',
      description: '自动检测并删除视频中的黑屏片段',
      parameters: {
        type: 'object',
        properties: {
          minDuration: { type: 'number', description: '最短黑屏时长（秒），默认 0.5' },
          threshold:   { type: 'number', description: '黑屏亮度阈值 0-1，默认 0.1' },
        },
      },
    },
  },

  mcpSchema: {
    name: 'remove_black_screens',
    description: '自动检测并删除视频中的黑屏片段',
    inputSchema: {
      type: 'object',
      properties: {
        mediaId:     { type: 'string', description: '媒体文件 ID' },
        minDuration: { type: 'number', description: '最短黑屏时长（秒），默认 0.5' },
        threshold:   { type: 'number', description: '黑屏亮度阈值 0-1，默认 0.1' },
      },
      required: ['mediaId'],
    },
  },

  fallbackPattern: /黑屏|black.?screen/i,
  fallbackParams: () => ({}),

  execute: (params, ctx) => {
    if (!ctx.mediaFilePath) throw new Error('媒体文件路径未知，无法检测黑屏');
    return executeRemoveBlackScreens(ctx.mediaFilePath, params.minDuration, params.threshold);
  },
};

export default removeBlackScreensTool;
