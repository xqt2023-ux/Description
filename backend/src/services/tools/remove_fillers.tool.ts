import { ToolDefinition } from '../toolRegistry';
import { executeRemoveFillers } from '../editExecutors';

const removeFillersTool: ToolDefinition = {
  name: 'remove_fillers',
  label: '去除填充词',
  category: 'cut',

  functionSchema: {
    type: 'function',
    function: {
      name: 'remove_fillers',
      description: '删除视频中的填充词和口头禅（嗯、啊、那个、就是、um、uh、like）',
      parameters: {
        type: 'object',
        properties: {
          customWords: {
            type: 'array',
            items: { type: 'string' },
            description: '额外要删除的词（可选）',
          },
        },
      },
    },
  },

  mcpSchema: {
    name: 'remove_fillers',
    description: '删除视频中的填充词和口头禅（嗯、啊、那个、就是、um、uh、like）',
    inputSchema: {
      type: 'object',
      properties: {
        mediaId:     { type: 'string', description: '媒体文件 ID' },
        customWords: { type: 'array',  items: { type: 'string' }, description: '额外要删除的词（可选）' },
      },
      required: ['mediaId'],
    },
  },

  fallbackPattern: /嗯|啊|那个|就是|填充词|口头禅|filler/i,
  fallbackParams: () => ({}),

  execute: (params, ctx) => executeRemoveFillers(ctx.mediaId, params.customWords),
};

export default removeFillersTool;
