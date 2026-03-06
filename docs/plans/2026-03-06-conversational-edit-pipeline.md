# Conversational Edit Pipeline

**Date:** 2026-03-06
**Scope:** 对话式视频编辑全链路 — 自然语言 → 播放器实时预览 → FFmpeg 导出

---

## 目标

用户在 Underlord 对话框输入编辑需求，系统真正执行编辑：
1. 播放器实时跳过被删除的片段（预览）
2. 用户点击"导出"后，FFmpeg 生成成品视频（下载）

---

## 统一管道

所有编辑操作都产出 `cutRegions[]`，流经同一条管道：

```
用户自然语言
    ↓
Intent Parser（function calling + 关键词兜底）
    ↓
EditAction[]
    ↓
Executor（按类型分派，产出 cutRegions[]）
    ↓
SSE: step_done + patch { op: 'remove_segments', segments: cutRegions }
    ↓
前端 applyPatch → transcript 词语 deleted=true
    ↓
VideoPlayer 播放时自动跳过（实时预览 ✓）
    ↓
用户点"导出" → POST /api/ai/underlord/export → FFmpeg → 下载链接
```

**核心设计原则：** `cutRegions` 是唯一中间语言，无论来源如何，后续管道统一处理。

---

## Intent Parser

### Function Calling 工具定义

```typescript
const EDIT_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
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
  {
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
  {
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
  {
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
];
```

调用时使用 `tool_choice: 'required'`，强制 AI 必须调用一个工具。

### 关键词兜底（function calling 失败时）

```typescript
function fallbackParse(message: string): EditAction | null {
  if (/嗯|啊|那个|就是|填充词|口头禅|filler/i.test(message))
    return { type: 'remove_fillers', params: {} };

  const timeMatch = message.match(/(\d+(?:\.\d+)?)\s*[秒s].*?(\d+(?:\.\d+)?)\s*[秒s]/);
  if (timeMatch)
    return { type: 'cut_segment', params: { startTime: +timeMatch[1], endTime: +timeMatch[2] } };

  if (/静[音默]|停顿|silence/i.test(message))
    return { type: 'remove_silence', params: {} };

  if (/黑屏|black.?screen/i.test(message))
    return { type: 'remove_black_screens', params: {} };

  return null;
}
```

---

## Executors

### `remove_fillers`（依赖 transcript）

```typescript
async function executeRemoveFillers(mediaId: string, customWords?: string[]): Promise<CutRegion[]> {
  const transcript = getStoredTranscript(mediaId);
  if (!transcript) throw new Error('请先转录视频');

  const FILLER_WORDS = new Set([
    '嗯','啊','那个','就是','然后','对吧','好吧','这个',
    'um','uh','like','you know','so','basically',
    ...(customWords ?? []),
  ]);

  const regions: CutRegion[] = [];
  for (const segment of transcript.segments) {
    for (const word of segment.words ?? []) {
      if (FILLER_WORDS.has(word.text.trim().toLowerCase())) {
        regions.push({ startTime: word.start, endTime: word.end });
      }
    }
  }

  // 合并相邻区间（间隔 < 0.1s）
  return mergeAdjacentRegions(regions, 0.1);
}
```

### `cut_segment`（直接参数）

```typescript
async function executeCutSegment(startTime: number, endTime: number): Promise<CutRegion[]> {
  return [{ startTime, endTime }];
}
```

### `remove_silence`（FFmpeg silencedetect）

```typescript
async function executeRemoveSilence(
  mediaFilePath: string,
  threshold = -40,
  minDuration = 0.5
): Promise<CutRegion[]> {
  // ffmpeg -i input -af silencedetect=n=-40dB:d=0.5 -f null -
  // 解析 stderr 中的 silence_start / silence_end
  return parseSilenceDetectOutput(await runFFmpegSilenceDetect(mediaFilePath, threshold, minDuration));
}
```

### `remove_black_screens`（FFmpeg blackdetect）

```typescript
async function executeRemoveBlackScreens(
  mediaFilePath: string,
  minDuration = 0.5,
  threshold = 0.1
): Promise<CutRegion[]> {
  // ffmpeg -i input -vf blackdetect=d=0.5:pix_th=0.1 -f null -
  // 解析 stderr 中的 black_start / black_end
  return parseBlackDetectOutput(await runFFmpegBlackDetect(mediaFilePath, minDuration, threshold));
}
```

---

## underlordService.chat 重写

现有的 `createInteractiveWorkflow` 替换为 intent parsing + executor 直调：

```typescript
export async function chat(params, emit) {
  // 1. 流式对话响应（同现有实现）
  await streamConversationalResponse(params, emit);

  // 2. Function calling 解析意图
  const action = await parseIntent(params.message, params.mediaInfo)
    ?? fallbackParse(params.message);

  if (!action) {
    emit({ type: 'done', operationId: '' });
    return;
  }

  // 3. 执行 + 发 patch
  emit({ type: 'plan', steps: [ACTION_LABELS[action.type]] });
  const startTime = Date.now();
  emit({ type: 'step_start', name: ACTION_LABELS[action.type] });

  try {
    const cutRegions = await executeAction(action, params.mediaId, params.mediaFilePath);
    const patch: TimelinePatch = { op: 'remove_segments', segments: cutRegions };
    emit({
      type: 'step_done',
      name: ACTION_LABELS[action.type],
      durationMs: Date.now() - startTime,
      patch,
    });
    emit({ type: 'done', operationId: generateOperationId() });
  } catch (err: any) {
    emit({ type: 'error', message: err.message });
  }
}
```

---

## 导出层（Phase 3）

### 接口

```
POST /api/ai/underlord/export
Body: { mediaId: string, cuts: { startTime: number, endTime: number }[] }
Response: SSE 流
  → { type: 'progress', percent: number }
  → { type: 'done', downloadUrl: string }
```

### FFmpeg trim+concat

保留片段 = 总时长 - cutRegions（反算）：

```typescript
// 生成 filter_complex
function buildFFmpegFilter(duration: number, cuts: CutRegion[]): string {
  const keepRegions = invertCuts(duration, cuts);
  const parts = keepRegions.map((r, i) => `
    [0:v]trim=${r.startTime}:${r.endTime},setpts=PTS-STARTPTS[v${i}];
    [0:a]atrim=${r.startTime}:${r.endTime},asetpts=PTS-STARTPTS[a${i}]
  `).join(';');
  const concatInputs = keepRegions.map((_, i) => `[v${i}][a${i}]`).join('');
  return `${parts};${concatInputs}concat=n=${keepRegions.length}:v=1:a=1[outv][outa]`;
}
```

---

## 实现路线图

### Phase 1 — remove_fillers + intent parsing（约 150 行）

**文件改动：**
- `backend/src/services/underlordService.ts`：重写 `chat()`，加 intent parsing + `remove_fillers` executor
- 新建 `backend/src/services/editExecutors.ts`：executor 函数集合

**验收标准：**
- 用户说"去掉嗯啊" → Underlord 对话框显示自然语言回复（无 JSON）
- Details 显示"去除填充词" step completed
- 播放器中嗯啊对应词语被划掉，播放自动跳过

### Phase 2 — cut_segment + remove_silence + remove_black_screens（约 100 行）

**文件改动：**
- `backend/src/services/editExecutors.ts`：加 3 个 executor
- `backend/src/services/underlordService.ts`：注册新工具

**验收标准：**
- "去掉第 5 到 10 秒" → 播放器跳过该段
- "去掉停顿" → FFmpeg silencedetect → 播放器跳过静音段
- "去掉黑屏" → FFmpeg blackdetect → 播放器跳过黑屏段

### Phase 3 — 导出层（约 120 行）

**文件改动：**
- 新建 `backend/src/routes/export.ts`：`POST /api/ai/underlord/export`
- `frontend/src/components/editor/EditorLayout.tsx`：加"导出"按钮

**验收标准：**
- 点击导出 → SSE 显示进度 → 完成后出现下载链接
- 下载的视频中被删除片段已不存在

---

## Overlay 子系统（Phase 4）

### 数据模型

```typescript
interface OverlayItem {
  id: string;
  type: 'image' | 'text';

  // 时间范围（输出时间线上，-1 表示持续到结尾）
  startTime: number;
  endTime: number;

  // 位置（相对视频画面，字符串枚举）
  position: 'top-left' | 'top-center' | 'top-right'
           | 'center'
           | 'bottom-left' | 'bottom-center' | 'bottom-right';

  // 图片 overlay 专有
  imageUrl?: string;     // 上传后的文件路径（由 assetId 解析得到）
  width?: number;        // 占画面宽度比例 0-1，默认 0.2
  opacity?: number;      // 透明度 0-1，默认 1

  // 文字 overlay 专有
  text?: string;
  fontSize?: number;     // px，默认 48
  color?: string;        // 默认 '#ffffff'
  fontFamily?: string;   // 默认 'sans-serif'
  animation?: 'none' | 'fade' | 'typewriter';
}
```

TimelinePatch 扩展（已在类型定义中，Phase 4 实现）：
```typescript
{ op: 'add_overlay';    overlay: Omit<OverlayItem, 'id'> }
{ op: 'remove_overlay'; overlayId: string }
```

### Function Calling 工具

```typescript
// add_text_overlay
{
  name: 'add_text_overlay',
  description: '在视频指定时间段叠加文字（标题、字幕、花字）',
  parameters: {
    text: string,
    startTime: number,
    endTime: number,           // -1 = 持续到结尾
    position?: string,         // 默认 'bottom-center'
    fontSize?: number,
    color?: string,
    animation?: 'none' | 'fade' | 'typewriter',
  }
}

// add_image_overlay
{
  name: 'add_image_overlay',
  description: '在视频指定时间段叠加图片或 Logo',
  parameters: {
    assetId: string,           // 已上传资产 ID
    startTime: number,
    endTime: number,           // -1 = 持续到结尾
    position?: string,         // 默认 'bottom-right'
    width?: number,            // 占画面宽度比例 0-1，默认 0.2
    opacity?: number,
  }
}
```

**图片资产流程**：用户先上传 logo/图片（复用现有媒体上传接口，返回 assetId），然后在对话中引用 assetId。

### OverlayRenderer（前端，新建）

绝对定位叠加在 `<video>` 上方，从 `editorStore.timeline.overlays` 读取，用 `currentTime` 过滤当前帧内有效的 overlay：

```tsx
// frontend/src/components/editor/OverlayRenderer.tsx
const POSITION_STYLE: Record<string, React.CSSProperties> = {
  'top-left':      { top: '5%', left: '5%' },
  'top-center':    { top: '5%', left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: '5%', right: '5%' },
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  'bottom-left':   { bottom: '5%', left: '5%' },
  'bottom-center': { bottom: '5%', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: '5%', right: '5%' },
};
```

### FFmpeg 导出合成

文字 overlay（FFmpeg drawtext filter）：
```bash
ffmpeg -i video.mp4 \
  -vf "drawtext=text='第一章':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=50:enable='between(t,5,10)'" \
  output.mp4
```

图片 overlay（FFmpeg overlay filter）：
```bash
ffmpeg -i video.mp4 -i logo.png \
  -filter_complex "overlay=W-w-20:H-h-20:enable='between(t,0,60)'" \
  output.mp4
```

多个 overlay 时链式拼接 filter_complex。

### Phase 4 实现路线

| Phase | 内容 | 估计工作量 |
|-------|------|-----------|
| **4a** | 文字 overlay：add_text_overlay executor + applyPatch 分支 + OverlayRenderer（文字部分）+ FFmpeg drawtext 导出 | ~200 行 |
| **4b** | 图片 overlay：资产上传接口 + add_image_overlay executor + OverlayRenderer（图片部分）+ FFmpeg overlay 导出 | ~200 行 |

---

## 兼容性

| 现有功能 | 影响 |
|---------|------|
| SSE 协议（text/plan/step_start/step_done/done/error）| ✓ 保持不变 |
| TimelinePatch + applyPatch | ✓ 保持不变，phase 1 只用 remove_segments |
| interactiveEditWorkflow.ts | 不再被 underlordService 调用，保留供其他路由使用 |
| transcript 词语 deleted + VideoPlayer 跳过 | ✓ 复用，无需改动 |
