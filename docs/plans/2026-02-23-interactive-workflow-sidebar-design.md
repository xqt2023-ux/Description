# Interactive Workflow Sidebar Design

**Date:** 2026-02-23
**Feature:** AI 对话式视频编辑 — 步骤展示 + 批量执行 + 逐步审核

## 用户流程

1. 用户在侧边栏输入框中描述编辑需求（如"删除所有口误并去除长停顿"）
2. AI 解析请求，生成步骤列表并展示
3. 用户勾选/取消各步骤
4. 点击"批量执行"，已勾选步骤依次执行
5. 每步完成后显示状态（✅ 成功 / ❌ 失败 / ⏭ 跳过）和结果摘要
6. 用户可对最后一个完成的步骤点击撤销

## 界面结构

```
┌─────────────────────────────────┐
│  ✦ AI 编辑助手                   │
├─────────────────────────────────┤
│ [输入框] 描述你想做的编辑...      │
│                       [发送 →]   │
├─────────────────────────────────┤
│ 📋 编辑计划  (4 个步骤)          │
│                                 │
│  ☑ 1. 删除所有口误和重复词       │
│  ☑ 2. 去除超过 1s 的停顿         │
│  ☑ 3. 裁剪片尾 30 秒空白         │
│  ☐ 4. 添加背景音乐               │
│                                 │
│        [全选]  [批量执行 ▶]      │
├─────────────────────────────────┤
│ 执行结果                        │
│  ✅ 1. 删除口误  — 去除 23 处    │
│     [↩ 撤销]                     │
│  ✅ 2. 去除停顿  — 缩短 4.2s    │
│     [↩ 撤销（disabled）]         │
│  🔄 3. 裁剪片尾  — 执行中...    │
│  ⏭ 4. 添加背景音乐  — 已跳过   │
└─────────────────────────────────┘
```

## 状态机

```
idle → planning → executing → done
         ↑                      ↓
         └──────── reset ────────┘
```

- **idle**: 显示输入框
- **planning**: 显示步骤勾选列表
- **executing**: 顺序执行中，步骤逐个更新状态
- **done**: 所有步骤完成，可撤销/重置

## 技术实现

### 新建文件
- `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` (~250 行)

### 修改文件
- `frontend/src/components/editor/EditorLayout.tsx` — 补全 `setWorkflowId` 传递
- `frontend/src/components/editor/DescriptEditorNew.tsx` — Underlord 面板触发 workflow（替代直接 orchestrate）

### API 调用链

```typescript
// 1. 创建工作流（AI 解析步骤）
workflowApi.create(userRequest, mediaId, mediaInfo)
// → 返回 { workflowId, steps: Step[] }

// 2. 批量执行（遍历已勾选步骤）
for (const step of checkedSteps) {
  await workflowApi.executeStep(workflowId, step.id)
  await workflowApi.confirmStep(workflowId, step.id, true)
  // 更新该步骤 UI 状态
}

// 3. 撤销最后一步
workflowApi.undo(workflowId)

// 4. 取消整个工作流
workflowApi.cancel(workflowId)
```

## 边界处理

| 场景 | 处理方式 |
|------|---------|
| 某步骤执行失败 | 标记 ❌，继续后续步骤，不中断批次 |
| 网络超时 | 显示"超时"状态 + 重试按钮 |
| AI 无法解析请求 | 提示"请重新描述" |
| 撤销限制 | 只允许撤销最后完成的步骤（LIFO），其余按钮 disabled |
| 中途取消 | 调用 cancel()，已执行步骤保留 |
| 状态持久化 | 不持久化（组件 useState），刷新即清空 |

## 不需要改动
- 后端所有 API ✅
- `frontend/src/lib/api.ts` 的 `workflowApi` ✅
