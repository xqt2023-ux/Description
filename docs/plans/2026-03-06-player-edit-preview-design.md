# Player Edit Preview Design

**Date:** 2026-03-06
**Feature:** 编辑后的效果实时展现在播放器中
**Goal:** Underlord AI 执行编辑操作后，播放器时间轴实时显示剪切区域，播放时自动跳过被删除的片段

---

## 问题陈述

当前状态：
- **手动编辑**（用户在转录文本点击删除词语）→ transcript 词语标记 `deleted: true` → 播放器自动跳过 ✓
- **Underlord AI 编辑** → 后端执行 workflow → 生成预览文件 → **但前端 transcript 未更新** → 播放器无感知 ✗

缺失的桥梁：AI 编辑结果 → 前端 transcript 更新 → 播放器实时反映

---

## 设计决策

| 问题 | 决策 |
|------|------|
| 何时更新播放器？ | 每个 step 完成时实时更新（Descript 风格） |
| 数据如何传递？ | `step_done` SSE 事件携带 `cuts[]` 字段 |
| 如何在播放器呈现？ | 映射到 transcript 词语 `deleted: true`，复用现有跳过机制 |

---

## 数据流

```
Underlord 执行 step
  ↓
后端识别该 step 实际产生的时间区间
  ↓
step_done SSE 事件携带 cuts: [{startTime, endTime}]
  ↓
前端 applySSEEvent('step_done') 接收 cuts
  ↓
调用 editorStore.markWordsDeletedByTime(cuts)
  ↓
transcript 中对应词语 deleted = true（pushHistory 保障 undo）
  ↓
VideoPlayer selectDeletedWordRanges() 自动重算
  ↓
时间轴红色标记 + 总时长缩短 + 播放自动跳过 ✓
```

---

## SSE 协议变更

### 现有 `step_done` 事件
```typescript
{ type: 'step_done', name: string, durationMs: number }
```

### 新增 `cuts` 字段（可选，无 cuts 时行为不变）
```typescript
{
  type: 'step_done',
  name: '移除填充词',
  durationMs: 120,
  cuts: [                           // 新增，可选
    { startTime: 2.3, endTime: 2.8 },
    { startTime: 15.1, endTime: 15.6 }
  ]
}
```

类型定义更新：
```typescript
// frontend/src/components/editor/InteractiveWorkflowSidebar.tsx
// backend/src/services/underlordService.ts
type SSEEvent =
  | { type: 'text'; delta: string }
  | { type: 'plan'; steps: string[] }
  | { type: 'step_start'; name: string }
  | { type: 'step_done'; name: string; durationMs: number; cuts?: CutRegion[] }  // 新增 cuts
  | { type: 'done'; operationId: string }
  | { type: 'error'; message: string };

interface CutRegion {
  startTime: number;
  endTime: number;
}
```

---

## 需要改动的文件

### 1. `backend/src/services/interactiveEditWorkflow.ts`

`executeWorkflowStep` 执行完成后，从 step 结果的 `preview.metadata` 中提取实际剪切区间：

```typescript
// 执行 step 后提取 cuts
function extractCutsFromStepResult(step: WorkflowStep): CutRegion[] {
  const meta = step.preview?.metadata;
  if (!meta) return [];

  // remove_fillers / cut 操作会有 cutRegions
  if (meta.cutRegions) return meta.cutRegions;

  // 单区间操作（trim 等）
  if (meta.startTime !== undefined && meta.endTime !== undefined) {
    return [{ startTime: meta.startTime, endTime: meta.endTime }];
  }

  return [];
}
```

### 2. `backend/src/services/underlordService.ts`

在 `step_done` 事件中携带 cuts：

```typescript
const cuts = extractCutsFromStepResult(step);
emit({
  type: 'step_done',
  name: step.description,
  durationMs: Date.now() - startTime,
  ...(cuts.length > 0 ? { cuts } : {}),
});
```

### 3. `frontend/src/stores/editorStore.ts`

新增 `markWordsDeletedByTime` action：

```typescript
markWordsDeletedByTime: (cuts: { startTime: number; endTime: number }[]) => {
  const { transcript } = get();
  if (!transcript) return;

  // 在 undo 历史中保存当前状态
  get().pushHistory();

  const updated = {
    ...transcript,
    segments: transcript.segments.map(segment => ({
      ...segment,
      words: segment.words.map(word => {
        const inCut = cuts.some(
          cut => word.startTime >= cut.startTime && word.endTime <= cut.endTime
        );
        return inCut ? { ...word, deleted: true } : word;
      }),
    })),
  };

  set({ transcript: updated, isDirty: true });
},
```

### 4. `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx`

在 `applySSEEvent` 的 `step_done` 分支中调用 store：

```typescript
import { useEditorStore } from '@/stores/editorStore';

// 在组件内
const markWordsDeletedByTime = useEditorStore(s => s.markWordsDeletedByTime);

// applySSEEvent 中
case 'step_done':
  if (event.cuts && event.cuts.length > 0) {
    markWordsDeletedByTime(event.cuts);
  }
  return {
    ...m,
    steps: m.steps?.map(s =>
      s.name === event.name
        ? { ...s, status: 'done', durationMs: event.durationMs }
        : s
    ),
  };
```

### 5. `frontend/src/components/editor/VideoPlayer.tsx`

**无需改动。** 现有 `selectDeletedWordRanges(transcript)` 选择器和播放跳过逻辑完全复用。

---

## Fallback：无 transcript 时

当视频未完成转录时，`transcript` 为 null，无法映射词语。

**降级方案：**
- 在 `editorStore` 增加 `aiCuts: CutRegion[]`
- `markWordsDeletedByTime` 在 transcript 为 null 时改写 `aiCuts`
- VideoPlayer 在计算跳过区间时合并 `selectDeletedWordRanges(transcript)` 和 `aiCuts`
- 视觉上用不同颜色区分（紫色 = AI 剪切，红色 = 手动剪切）

> **注：** Phase 1 仅实现有 transcript 的核心路径；Phase 2 (fallback) 作为后续迭代。

---

## Revert 支持

Underlord 侧边栏已有 Revert 按钮，调用 `underlordApi.revert(operationId)`。

由于 `markWordsDeletedByTime` 在修改前调用 `pushHistory()`，undo 通过 `editorStore.undo()` 即可恢复。

后端 `revert` 端点也可选择性地发送 undo SSE，让前端感知具体要还原哪些词语。

---

## 测试计划

| 场景 | 期望结果 |
|------|---------|
| Underlord 执行"去掉嗯啊"| 嗯啊词语在转录文本打叉，时间轴出现红色标记 |
| 播放到被删除区域 | 自动跳过，时长缩短显示 |
| 点击 Revert | 词语恢复，时间轴红色标记消失 |
| 无 transcript 时执行 AI 编辑 | 降级到 aiCuts，播放跳过但无打叉效果 |
| step 执行失败 | cuts 为空，transcript 不变，播放器无变化 |

---

## 实现优先级

- **Phase 1（核心路径）：** 文件 1-4，约 80 行代码，有 transcript 时完整工作
- **Phase 2（fallback）：** editorStore.aiCuts + VideoPlayer 合并逻辑，约 40 行，无 transcript 时降级工作
