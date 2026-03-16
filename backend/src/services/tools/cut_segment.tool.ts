import { ToolDefinition } from '../toolRegistry';
import { executeCutSegment } from '../editExecutors';

const cutSegmentTool: ToolDefinition = {
  name: 'cut_segment',
  label: '剪切片段',
  category: 'cut',

  functionSchema: {
    type: 'function',
    function: {
      name: 'cut_segment',
      description: '删除视频中指定时间范围内的片段',
      parameters: {
        type: 'object',
        required: ['startTime', 'endTime'],
        properties: {
          startTime: { type: 'number', description: '开始时间（秒）' },
          endTime:   { type: 'number', description: '结束时间（秒）' },
        },
      },
    },
  },

  mcpSchema: {
    name: 'cut_segment',
    description: '删除视频中指定时间范围内的片段',
    inputSchema: {
      type: 'object',
      properties: {
        mediaId:   { type: 'string', description: '媒体文件 ID' },
        startTime: { type: 'number', description: '开始时间（秒）' },
        endTime:   { type: 'number', description: '结束时间（秒）' },
      },
      required: ['mediaId', 'startTime', 'endTime'],
    },
  },

  fallbackPattern: /(\d+(?:\.\d+)?)\s*[秒s].*?(\d+(?:\.\d+)?)\s*[秒s]/,
  fallbackParams: (match) => ({ startTime: +match[1], endTime: +match[2] }),

  execute: (params, _ctx) => executeCutSegment(params.startTime, params.endTime),
};

export default cutSegmentTool;
