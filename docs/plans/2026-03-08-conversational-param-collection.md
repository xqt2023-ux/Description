# 互动式参数收集系统设计

**日期**: 2026-03-08
**状态**: 待实现

## 目标

将 Underlord 聊天升级为真正的对话式工作流：LLM 自主决定何时提问、问什么、问几次；前端状态机只负责渲染 LLM 请求的交互组件。

---

## 核心设计原则

**LLM 驱动对话流程，前端驱动 UI 渲染**

- "去除静音" → LLM 问阈值
- "去除2秒以上的静音" → LLM 直接执行，不问了
- "帮我优化视频" → LLM 自由决定问哪些问题、以什么顺序

---

## 架构：function calling 扩展

### 现有工具（执行类）
```
remove_fillers, cut_segment, remove_silence, remove_black_screens
```

### 新增工具（对话类）
LLM 可调用 `ask_question` 向前端请求一个交互组件：

```typescript
{
  name: "ask_question",
  description: "Ask the user a clarifying question using a specific UI widget. Use when you need more information before executing an edit. Prefer direct execution if user already provided the parameter.",
  parameters: {
    kind: "number" | "choice" | "position" | "file",
    key: string,       // 参数名，用于在后续对话中引用
    label: string,     // 展示给用户的问题文本
    // kind=number
    default?: number,
    min?: number,
    max?: number,
    step?: number,
    unit?: string,     // 如 "秒"
    // kind=choice
    options?: Array<{ label: string; value: string }>,
    // kind=file
    accept?: string,   // 如 "image/*"
    // kind=position 无需额外参数（固定九宫格）
  }
}
```

---

## 完整对话流程

```
用户: "帮我去除静音"
  │
  ▼
后端: LLM 分析 → 调用 ask_question(kind="number", key="threshold", label="静音超过多少秒？", default=1.5, min=0.5, max=10, unit="秒")
  │
  ▼ SSE: { type: "question", question: { kind, key, label, default, min, max, unit } }
  │
前端: 渲染滑块组件
  │
用户: 拖动到 2s，点击确认
  │
  ▼ 发送: { role: "user", content: "[threshold: 2秒]" }
  │
后端: LLM 分析 → 参数已齐 → 调用 remove_silence(threshold=2)
  │
  ▼ SSE: { type: "step_done", patch: {...} }
  │
前端: 应用 patch，显示完成
```

**用户已提供参数的情况：**
```
用户: "去除2秒以上的静音"
  │
后端: LLM 分析 → 直接调用 remove_silence(threshold=2)（不问了）
```

**多参数情况（Logo）：**
```
用户: "帮我加个Logo"
  → LLM: ask_question(kind="file", key="logo_file", label="请上传你的 Logo 图片", accept="image/*")
  → 用户上传图片
  → LLM: ask_question(kind="position", key="position", label="Logo 放在哪里？")
  → 用户选择右下角
  → LLM: ask_question(kind="choice", key="duration", label="Logo 显示时长？", options=[全程/开头/结尾])
  → 用户选择全程
  → LLM: 执行 add_logo(file=..., position="bottom-right", duration="full")
```

---

## SSE 协议扩展

新增两种事件类型（在现有 text/plan/step_start/step_done/done/error 基础上）：

```typescript
// 后端发送：渲染交互组件
{ type: "question", question: ToolQuestion }

// 后端发送：执行确认（可选，目前工具直接执行）
{ type: "ready", tool: string, params: Record<string, unknown> }
```

用户回答通过普通用户消息发送，格式：`[key: value]`，LLM 可在上下文中读取。

---

## 前端状态机

`InteractiveWorkflowSidebar` 扩展：

```typescript
// 消息类型扩展
type ChatMessage =
  | { id: string; role: 'user' | 'assistant'; content: string; status?: string }
  | { id: string; role: 'question'; question: ToolQuestion; answered?: string }  // 新增

// 收到 SSE question 事件时
case 'question':
  setMessages(prev => [...prev, { id, role: 'question', question: event.question }]);
  setIsStreaming(false);  // 暂停，等用户回答

// 用户回答 widget 时
function handleAnswer(questionMsg: ChatMessage, value: unknown) {
  const answerText = formatAnswer(questionMsg.question, value);
  // 1. 把问题消息标记为已回答
  setMessages(prev => prev.map(m => m.id === questionMsg.id ? { ...m, answered: answerText } : m));
  // 2. 把答案作为用户消息发回后端，继续对话
  sendMessage(`[${questionMsg.question.key}: ${answerText}]`);
}
```

---

## 前端组件：QuestionWidget

新建 `frontend/src/components/editor/QuestionWidget.tsx`：

### NumberQuestion — 滑块
```
静音超过多少秒才删除？
[━━━●━━━━━━━━━] 1.5 秒
[确认]
```

### ChoiceQuestion — 按钮组（点击即提交）
```
Logo 显示时长？
[全程]  [开头10秒]  [结尾10秒]
```

### PositionQuestion — 九宫格（点击即提交）
```
Logo 放在哪里？
┌──┬──┬──┐
│↖│↑│↗│
├──┼──┼──┤
│←│·│→│
├──┼──┼──┤
│↙│↓│↘│
└──┴──┴──┘
```

### FileQuestion — 内联上传
```
请上传你的 Logo 图片
┌─────────────────────┐
│  🖼  拖拽或点击上传  │
│  支持 PNG / SVG     │
└─────────────────────┘
```

已回答的问题组件折叠为只读摘要行，不占空间。

---

## 后端改动

### 1. `underlordService.ts` — 注册 ask_question 工具

在传给 LLM 的 tools 列表中加入 `ask_question` 工具定义（与现有编辑工具并列）。

### 2. `underlordService.ts` — 处理 ask_question 调用

LLM 调用 `ask_question` 时，不执行任何操作，只通过 SSE 转发 question 事件给前端：
```typescript
if (toolCall.name === 'ask_question') {
  yield { type: 'question', question: toolCall.args };
  return;  // 暂停，等用户回答后前端发新消息
}
```

### 3. System prompt 更新

告知 LLM：
- 可以调用 `ask_question` 收集缺失参数
- 用户已经提供的参数直接使用，不重复问
- 用户回答格式为 `[key: value]`，从上下文中提取

---

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `backend/src/services/underlordService.ts` | 修改 | 注册 ask_question 工具；处理其调用；更新 system prompt |
| `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` | 修改 | 处理 `question` SSE 事件；渲染 QuestionWidget；handleAnswer 逻辑 |
| `frontend/src/components/editor/QuestionWidget.tsx` | 新建 | 4 种问题组件 |

---

## 不在本次范围

- 文件上传到服务器（`add_logo` 工具本身）
- 参数持久化
- 语音输入
- 多步骤复合操作的 undo
