# Underlord Chat UI — Design

**Date:** 2026-03-05
**Status:** Approved, ready to implement

## Overview

Redesign `InteractiveWorkflowSidebar` from a step-list workflow UI into a conversational chat interface modeled after the original Descript Underlord. Claude API drives natural language responses; the existing workflow service executes operations.

---

## User Flow

```
用户在 "Ask Underlord" 输入框输入需求
        ↓
前端发送 POST /api/ai/underlord (SSE)
        ↓
后端调用 Claude API → 流式返回自然语言 + 结构化操作列表
        ↓
前端实时展示 Claude 的流式文字（打字效果）
        ↓
后端解析操作列表 → 调用 interactiveEditWorkflow 执行
        ↓
每步完成 → 推送 step_start / step_done 事件
        ↓
前端 Details 折叠区实时更新步骤状态
        ↓
全部完成 → 消息 status = 'done'，显示 Revert 按钮
```

---

## Design Decisions

| 问题 | 决策 |
|------|------|
| AI 回应来源 | Claude API 真实调用 |
| 执行模式 | 流式思考：AI 边说边展示过程 |
| 架构分层 | 两层：Claude 生成语言+计划，workflow 服务执行 |
| Revert | 每次操作完成后显示 Revert 按钮 |
| 现有 workflow API | 保留不变，作为 underlordService 的执行层 |

---

## UI Layout

```
┌─────────────────────────────┐
│ Underlord              [⊡]  │  标题栏（保留现有样式）
├─────────────────────────────┤
│  （消息滚动区）              │
│                             │
│   ┌─────────────────────┐  │  用户消息：右对齐紫色气泡
│   │ 去掉所有字幕         │  │
│   └─────────────────────┘  │
│                             │
│ 我来帮你把字幕删掉。        │  AI 消息：左对齐纯文本，流式打字
│ 正在分析视频轨道...         │
│ 找到 2 条字幕轨道...        │
│ ✅ 完成！字幕已全部删除。   │
│                             │
│  ▶ Details                  │  折叠区（默认关闭）
│    ✓ Read script    17ms    │
│    ✓ Found 2 tracks 10ms    │
│    ✓ Removed        84ms    │
│                             │
│  [↩ Revert]                 │  完成后显示
│                             │
├─────────────────────────────┤
│ 📎  Ask Underlord  Beta [↑] │  输入框
└─────────────────────────────┘
```

---

## Data Model

### Frontend — ChatMessage

```typescript
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;              // 累积的流式文字
  status: 'streaming' | 'done' | 'error';
  steps?: {
    name: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    durationMs?: number;
  }[];
  operationId?: string;         // 用于 Revert
  detailsOpen?: boolean;
};
```

### Backend — SSE Event Protocol

```typescript
// 前端 → 后端
POST /api/ai/underlord
{
  message: string,
  mediaId: string,
  mediaInfo: { duration: number, transcript?: string },
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
}

// 后端 → 前端（SSE 事件流）
{ type: 'text',       delta: '...' }
{ type: 'plan',       steps: string[] }
{ type: 'step_start', name: string }
{ type: 'step_done',  name: string, durationMs: number }
{ type: 'done',       operationId: string }
{ type: 'error',      message: string }
```

---

## Implementation Plan

### 1. `backend/src/services/underlordService.ts` （新建）

- `chat(params, onEvent)` — 核心编排函数：
  1. 构建 system prompt：介绍可用操作（remove_fillers、trim_silences 等）
  2. 调用 Claude API（流式），emit `text` delta 事件
  3. 解析 Claude 响应中的操作列表（JSON 块）
  4. emit `plan` 事件
  5. 逐步调用 `interactiveEditWorkflow.executeStep()`
  6. 每步 emit `step_start` / `step_done`
  7. 完成后 emit `done`（附 operationId 用于 revert）

### 2. `backend/src/routes/ai.ts` （新增路由）

```typescript
router.post('/underlord', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  await underlordService.chat(req.body, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  res.end();
});

router.post('/underlord/revert/:operationId', async (req, res) => {
  // 调用 workflowApi.undo(operationId)
});
```

### 3. `frontend/src/lib/api.ts` （新增）

```typescript
underlordApi: {
  chat(params): EventSource  // 返回 SSE 连接，供组件消费
  revert(operationId: string): Promise<void>
}
```

### 4. `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` （完整重写）

- 状态：`messages: ChatMessage[]`, `input: string`, `isStreaming: boolean`
- `sendMessage()` → 创建 user 消息 → 开启 SSE → 处理事件流
- 消息渲染：user 气泡 / assistant 文字块
- Details 折叠区：每个 step 的状态 + 耗时
- Revert 按钮：`operationId` 存在时显示

---

## Files Changed

| 文件 | 变更类型 |
|------|---------|
| `backend/src/services/underlordService.ts` | 新建 |
| `backend/src/routes/ai.ts` | 新增 `/underlord` 和 `/underlord/revert/:id` |
| `frontend/src/lib/api.ts` | 新增 `underlordApi` |
| `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` | 完整重写 |

**保持不变：**
- `backend/src/services/interactiveEditWorkflow.ts`
- `backend/src/routes/workflows.ts`
- `frontend/src/stores/editorStore.ts`

---

## Out of Scope

- 对话历史持久化（不存 DB，刷新后清空）
- 文件附件上传（输入框旁的 📎 图标仅装饰）
- 模型选择器（固定使用 claude-haiku-4-5）
