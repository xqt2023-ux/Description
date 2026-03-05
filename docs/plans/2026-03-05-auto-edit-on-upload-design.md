# Auto-Edit on Upload — Design

**Date:** 2026-03-05
**Status:** Approved, ready to implement

## Overview

Allow users to type editing requirements alongside their video upload on the homepage. After entering the editor and transcription completes, the system automatically executes the requirements via the Underlord workflow, showing real-time progress in the sidebar.

---

## User Flow

```
首页：用户在现有 textarea 输入编辑需求 + 选择视频
          ↓
     点击 "Get started"
          ↓
   sessionStorage.pendingAutoEdit = promptText
   window.__pendingFile = selectedFile
          ↓
  导航到 /editor/new?hasFile=true
          ↓
编辑器：上传视频 → 提取音频 → 转录中...
          ↓
     转录完成（processingStatus.transcription === 'completed'）
          ↓
  检测到 autoEditRequest prop → 打开 Underlord 侧边栏
          ↓
  创建 workflow → 逐步自动执行所有步骤
          ↓
  显示完成结果 + [撤销全部] 按钮
```

---

## Design Decisions

| 问题 | 决策 |
|------|------|
| 输入位置 | 首页现有 textarea（`promptText` 状态，已存在） |
| 首页布局改动 | 无，只修改 `handleGetStarted` 逻辑 |
| 执行时机 | 等转录完成后执行（确保 AI 能参考完整文字稿上下文） |
| 执行控制 | 全部步骤一次性执行，完成后可撤销 |
| 执行期间 UI | Underlord 侧边栏自动弹出，逐步显示进度 |
| 转录失败 | 取消全部自动编辑，侧边栏显示明确错误 |

---

## Implementation Plan

### 1. `frontend/src/app/page.tsx`

**改动：`handleGetStarted` 函数（第 218 行）**

```typescript
const handleGetStarted = () => {
  // 保存编辑需求到 sessionStorage
  if (promptText.trim()) {
    sessionStorage.setItem('pendingAutoEdit', promptText.trim());
  } else {
    sessionStorage.removeItem('pendingAutoEdit');
  }

  if (selectedFile) {
    sessionStorage.setItem('pendingFile', JSON.stringify({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    }));
    (window as any).__pendingFile = selectedFile;
    router.push('/editor/new?hasFile=true');
  } else {
    router.push('/editor/new');
  }
};
```

---

### 2. `frontend/src/app/editor/[projectId]/page.tsx`

**改动：读取 sessionStorage，传 prop 给 DescriptEditor**

```typescript
function EditorContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  // ...existing code...

  // 读取自动编辑需求（读完立刻清除，避免刷新后重复执行）
  const [autoEditRequest] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const req = sessionStorage.getItem('pendingAutoEdit') || undefined;
    sessionStorage.removeItem('pendingAutoEdit');
    return req;
  });

  return (
    <DescriptEditor
      // ...existing props...
      autoEditRequest={autoEditRequest}
    />
  );
}
```

---

### 3. `frontend/src/components/editor/DescriptEditorNew.tsx`

**改动 A：新增 prop**

```typescript
interface DescriptEditorProps {
  // ...existing props...
  autoEditRequest?: string;
}
```

**改动 B：监听转录完成，触发自动执行**

```typescript
const autoEditExecuted = useRef(false);

useEffect(() => {
  if (!autoEditRequest) return;
  if (processingStatus.transcription !== 'completed') return;
  if (autoEditExecuted.current) return;

  autoEditExecuted.current = true;
  setShowUnderlordSidebar(true);  // 自动打开侧边栏

  // 触发自动执行（通过 ref 或 callback 通知侧边栏）
  pendingAutoEditRef.current = autoEditRequest;
}, [processingStatus.transcription, autoEditRequest]);
```

**改动 C：转录失败时清除待执行请求**

```typescript
useEffect(() => {
  if (processingStatus.transcription === 'error' && autoEditRequest) {
    autoEditExecuted.current = true; // 防止后续触发
    setShowUnderlordSidebar(true);
    // 侧边栏会收到 autoStartFailed=true，显示错误
  }
}, [processingStatus.transcription]);
```

---

### 4. `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx`

**改动：新增 `initialRequest` + `autoStart` props**

```typescript
interface InteractiveWorkflowSidebarProps {
  // ...existing props...
  initialRequest?: string;   // 预填充的编辑需求文本
  autoStart?: boolean;       // true 时跳过用户输入，直接执行
  autoStartFailed?: boolean; // true 时显示转录失败错误
}
```

**自动执行逻辑：**

```typescript
useEffect(() => {
  if (!autoStart || !initialRequest || !mediaId) return;

  const run = async () => {
    // 1. 显示用户需求
    appendMessage({ role: 'user', content: initialRequest });

    // 2. 创建 workflow
    const workflow = await workflowApi.create(initialRequest, mediaId);

    // 3. 逐步执行每个步骤（不等用户确认）
    for (const step of workflow.steps) {
      await workflowApi.executeStep(workflow.id, step.id);
      await workflowApi.confirmStep(workflow.id, step.id);
    }
  };

  run();
}, [autoStart, initialRequest, mediaId]);
```

**完成后显示：**
- 每步完成时追加一条 assistant 消息："✅ 步骤 N 完成"
- 全部完成后显示"🎉 全部完成！" + [撤销全部] 按钮

---

## Scope

**In scope:**
- 首页 `promptText` → sessionStorage → editor prop → 转录完成后自动执行
- Underlord 侧边栏自动打开并展示实时进度
- 转录失败时取消并提示

**Out of scope:**
- 对现有已上传项目的编辑页面不触发自动执行
- 不修改首页视觉布局
- 不新增快捷选项按钮（后续迭代）

---

## Files Changed

| 文件 | 变更类型 |
|------|---------|
| `frontend/src/app/page.tsx` | 修改 `handleGetStarted`（+5 行） |
| `frontend/src/app/editor/[projectId]/page.tsx` | 读取 sessionStorage，传新 prop（+8 行） |
| `frontend/src/components/editor/DescriptEditorNew.tsx` | 新增 prop + 2 个 useEffect（+25 行） |
| `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` | 新增 autoStart 逻辑（+40 行） |
