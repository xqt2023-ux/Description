# Timeline-Centric Architecture

**Date:** 2026-03-06
**Scope:** 视频编辑器整体技术架构 — 支持剪切、转场、花字、音频处理、数字人配音

---

## 背景与动机

最初的"编辑效果展示到播放器"设计（`cuts[] → transcript.word.deleted`）只覆盖删除型操作。

当需求扩展到**添加型操作**（转场、花字、数字人配音）时，transcript 模型无法承载。需要一个统一的 **Timeline** 作为所有编辑操作的状态容器。

---

## 核心数据模型

### Timeline（编辑状态，前端 editorStore）

```typescript
interface Timeline {
  duration: number;

  videoTrack: {
    clips: VideoClip[];          // 保留的视频片段（有序，连续覆盖原始时间线）
  };

  textOverlayTrack: {
    overlays: TextOverlay[];     // 花字、字幕
  };

  transitions: Transition[];    // 片段之间的转场效果

  audioEffects: {
    globalEffects: AudioEffectType[];     // 全局音效
    segments: AudioEffect[];              // 分段音效
  };

  dubbingTrack?: {
    segments: DubbingSegment[];           // 数字人配音
  };
}

interface VideoClip {
  id: string;
  sourceStart: number;    // 在原始视频中的开始时间
  sourceEnd: number;      // 在原始视频中的结束时间
  // 输出时长 = sourceEnd - sourceStart
}

interface TextOverlay {
  id: string;
  text: string;
  style: {
    fontSize: number;
    color: string;
    fontFamily: string;
    animation?: 'fade' | 'typewriter' | 'slide';
    position: { x: number; y: number; anchor: 'top-left' | 'center' | 'bottom-center' };
  };
  startTime: number;      // 在输出时间线上的开始时间
  endTime: number;
}

interface Transition {
  id: string;
  afterClipId: string;    // 接在哪个 clip 之后
  type: 'fade' | 'dissolve' | 'slide' | 'wipe' | 'zoom';
  duration: number;       // 转场时长（秒）
  direction?: 'left' | 'right' | 'up' | 'down';
}

type AudioEffectType = 'studioSound' | 'noiseCancellation' | 'loudnessNormalization';

interface AudioEffect {
  type: AudioEffectType;
  startTime?: number;     // 省略则作用于全局
  endTime?: number;
  params?: Record<string, number>;
}

interface DubbingSegment {
  id: string;
  audioUrl: string;       // 数字人配音文件
  startTime: number;      // 在输出时间线上的开始时间
  endTime: number;
  speakerId?: string;
}
```

---

## 统一 Patch 协议

所有编辑操作（无论来自 Underlord AI 还是用户手动操作）都通过 `TimelinePatch` 描述：

```typescript
type TimelinePatch =
  | { op: 'remove_segments';    segments: { startTime: number; endTime: number }[] }
  | { op: 'restore_segments';   segments: { startTime: number; endTime: number }[] }
  | { op: 'add_transition';     afterClipId: string; transition: Omit<Transition, 'id'> }
  | { op: 'remove_transition';  transitionId: string }
  | { op: 'add_overlay';        overlay: Omit<TextOverlay, 'id'> }
  | { op: 'update_overlay';     overlayId: string; updates: Partial<TextOverlay> }
  | { op: 'remove_overlay';     overlayId: string }
  | { op: 'apply_audio_effect'; effect: AudioEffectType }
  | { op: 'remove_audio_effect'; effect: AudioEffectType }
  | { op: 'add_dubbing';        segments: Omit<DubbingSegment, 'id'>[] }
  | { op: 'remove_dubbing';     segmentIds: string[] };
```

---

## SSE 协议变更

`step_done` 事件统一携带 `patch` 字段（替代之前设计的 `cuts` 字段）：

```typescript
// 原有事件类型保持不变，新增 patch 字段
type SSEEvent =
  | { type: 'text'; delta: string }
  | { type: 'plan'; steps: string[] }
  | { type: 'step_start'; name: string }
  | { type: 'step_done'; name: string; durationMs: number; patch?: TimelinePatch }
  | { type: 'done'; operationId: string }
  | { type: 'error'; message: string };
```

**各操作示例：**

```jsonc
// 去除填充词/停顿
{ "type": "step_done", "name": "移除填充词", "patch": {
    "op": "remove_segments",
    "segments": [{ "startTime": 2.3, "endTime": 2.8 }]
}}

// 添加转场
{ "type": "step_done", "name": "添加淡入淡出转场", "patch": {
    "op": "add_transition",
    "afterClipId": "clip-3",
    "transition": { "type": "fade", "duration": 0.5 }
}}

// 添加花字
{ "type": "step_done", "name": "添加字幕", "patch": {
    "op": "add_overlay",
    "overlay": { "text": "第一章", "startTime": 5.0, "endTime": 8.0,
                 "style": { "fontSize": 32, "color": "#ffffff", "animation": "fade",
                            "position": { "x": 0.5, "y": 0.1, "anchor": "center" }}}
}}

// Studio Sound 音频处理
{ "type": "step_done", "name": "应用 Studio Sound", "patch": {
    "op": "apply_audio_effect",
    "effect": "studioSound"
}}

// 数字人配音
{ "type": "step_done", "name": "添加数字人配音", "patch": {
    "op": "add_dubbing",
    "segments": [{ "audioUrl": "/dubbing/seg-1.mp3", "startTime": 0, "endTime": 12.5 }]
}}
```

---

## 前端状态架构

### EditorStore 变更

```typescript
// 新增 timeline 相关状态（原有 transcript 保留，用于文本编辑和字幕显示）
interface EditorState {
  transcript: Transcript | null;     // 保留：文本编辑、打叉显示
  timeline: Timeline;                // 新：渲染状态，所有编辑的最终表达
  // ... 其他现有状态
}

// 新增 action
applyPatch: (patch: TimelinePatch) => void;
// 内部实现：
// 1. pushHistory()  — 保存 undo 快照
// 2. 根据 patch.op 分支处理
// 3. 更新 timeline
// 4. 若 patch.op === 'remove_segments'，同步更新 transcript.words[].deleted
```

### Transcript 与 Timeline 的关系

```
Transcript（文本层）            Timeline（渲染层）
─────────────────              ─────────────────
word.deleted = true    ←→      videoTrack.clips（保留区间的补集）

手动在转录文本打叉     ──→    自动生成 remove_segments patch
                              ──→ applyPatch() ──→ 更新 timeline

AI step_done patch    ──→    applyPatch() ──→ 更新 timeline
                              ──→ 同步标记 transcript.words[].deleted
```

两层保持同步，但 **Timeline 是渲染的唯一真相来源**。

---

## 渲染器架构

```
┌─────────────────────────────────────────────────┐
│                  EditorLayout                   │
│  ┌──────────────────────────────────────────┐   │
│  │           VideoPlayer                    │   │
│  │  ├── 读取 timeline.videoTrack.clips      │   │
│  │  ├── 读取 timeline.transitions           │   │
│  │  └── 跳过非 clip 区域                   │   │
│  │           │                              │   │
│  │  ┌────────▼─────────────────────────┐   │   │
│  │  │    TextOverlayRenderer           │   │   │
│  │  │  (绝对定位叠加在视频上)           │   │   │
│  │  │  读取 timeline.textOverlayTrack  │   │   │
│  │  └──────────────────────────────────┘   │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  AudioEffectIndicator (显示已应用的音频效果)     │
│  DubbingTrackVisualizer (时间轴底部显示配音轨道) │
└─────────────────────────────────────────────────┘
```

| 渲染器 | 新建/改动 | 读取的 Timeline 字段 |
|--------|-----------|---------------------|
| `VideoPlayer.tsx` | 改动 | `videoTrack.clips`, `transitions` |
| `TextOverlayRenderer.tsx` | **新建** | `textOverlayTrack.overlays` |
| `AudioEffectIndicator.tsx` | **新建** | `audioEffects.globalEffects` |
| `DubbingTrackVisualizer.tsx` | **新建** | `dubbingTrack.segments` |

---

## Undo / Revert 设计

### 本地 Undo（editorStore.undo）

`applyPatch()` 每次调用前 `pushHistory()`，存储 `{ timeline, transcript }` 的深拷贝。最多 50 步。

### AI 操作 Revert（Underlord Revert 按钮）

```
用户点击 Revert
  ↓
underlordApi.revert(operationId)
  ↓
后端返回该 operationId 对应的逆向 patches（或 before 快照）
  ↓
前端依次 applyPatch(reversePatch) 还原状态
```

---

## 实现路线图

### Phase 1 — remove_segments（当前 player-preview 功能）
- 文件：`editorStore.applyPatch` (仅处理 `remove_segments`)
- 文件：`InteractiveWorkflowSidebar` SSE handler 读 `patch`
- 文件：`underlordService` emit `patch` 替代 `cuts`
- 预计工作量：约 100 行

### Phase 2 — TextOverlay（花字/字幕）
- 新建 `TextOverlayRenderer.tsx`
- `applyPatch` 支持 `add_overlay / remove_overlay / update_overlay`
- 后端 `interactiveEditWorkflow` 花字 step 生成对应 patch
- 预计工作量：约 200 行

### Phase 3 — Transitions（转场）
- VideoPlayer 改造支持 CSS/Canvas 转场效果
- `applyPatch` 支持 `add_transition / remove_transition`
- 预计工作量：约 150 行

### Phase 4 — AudioEffects & Dubbing
- 仅播放器预览级支持（真正处理在 export 时由 FFmpeg 完成）
- 视觉指示器显示已应用的效果
- 预计工作量：约 100 行

---

## 与现有功能的兼容性

| 现有功能 | 兼容性 |
|---------|--------|
| 手动在转录文本打叉 | ✓ 内部生成 `remove_segments` patch，路径统一 |
| Studio Sound（现有 audioEnhancement 服务） | ✓ Phase 4 添加 `apply_audio_effect` patch |
| 现有 workflow API（`/api/ai/workflow/*`） | ✓ step result 追加 patch 字段，向后兼容 |
| 现有 Underlord SSE 协议 | ✓ `step_done` 新增可选 `patch` 字段，不破坏现有 |
| 导出（FFmpeg）| ✓ Export 时读取 Timeline 状态，而非 transcript |
