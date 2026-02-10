# 交互式视频编辑工作流 API

## 概述

交互式工作流允许用户输入自然语言编辑需求,AI自动分解为多个步骤,逐步执行并预览每步结果,等待用户确认后继续。

## 工作流程

```
用户输入需求
    ↓
AI分解任务 → 生成工作流步骤
    ↓
执行步骤1 → 生成预览
    ↓
用户查看预览 → 确认/拒绝/跳过
    ↓
执行步骤2 → 生成预览
    ↓
... 重复 ...
    ↓
所有步骤完成 → 最终输出
```

## API端点

### 1. 创建工作流

**POST** `/api/ai/workflow/create`

创建交互式编辑工作流,AI将分析用户需求并生成步骤计划。

**请求体:**
```json
{
  "userRequest": "删除前10秒,然后加快2倍速度",
  "mediaId": "video-123",
  "mediaInfo": {
    "duration": 60,
    "hasAudio": true,
    "width": 1920,
    "height": 1080
  }
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "workflow": {
      "id": "workflow-abc123",
      "mediaId": "video-123",
      "sourceFilePath": "/uploads/videos/video.mp4",
      "userRequest": "删除前10秒,然后加快2倍速度",
      "steps": [
        {
          "id": "step-1",
          "stepNumber": 1,
          "instruction": {
            "type": "cut",
            "params": { "startTime": 0, "endTime": 10 },
            "description": "删除前10秒"
          },
          "status": "pending",
          "requiresConfirmation": true
        },
        {
          "id": "step-2",
          "stepNumber": 2,
          "instruction": {
            "type": "speed_change",
            "params": { "speed": 2.0 },
            "description": "加快2倍速度"
          },
          "status": "pending",
          "requiresConfirmation": true
        }
      ],
      "currentStepIndex": 0,
      "status": "awaiting_confirmation",
      "createdAt": "2026-02-06T10:00:00Z"
    }
  }
}
```

### 2. 获取工作流状态

**GET** `/api/ai/workflow/:workflowId`

获取工作流的当前状态和所有步骤信息。

**响应:**
```json
{
  "success": true,
  "data": {
    "workflow": {
      "id": "workflow-abc123",
      "currentStepIndex": 1,
      "status": "awaiting_confirmation",
      "steps": [
        {
          "id": "step-1",
          "stepNumber": 1,
          "status": "completed",
          "previewUrl": "/api/workflow/preview/preview-abc-step1.mp4",
          "userApproved": true
        },
        {
          "id": "step-2",
          "stepNumber": 2,
          "status": "pending"
        }
      ]
    }
  }
}
```

### 3. 执行步骤

**POST** `/api/ai/workflow/:workflowId/step/:stepId/execute`

执行工作流中的指定步骤,生成预览视频。

**响应:**
```json
{
  "success": true,
  "data": {
    "step": {
      "previewPath": "/uploads/previews/preview-abc-step1.mp4",
      "previewUrl": "/api/workflow/preview/preview-abc-step1.mp4",
      "ffmpegCommand": "ffmpeg -y -i input.mp4 -vf 'select=...' output.mp4"
    },
    "workflow": {
      "id": "workflow-abc123",
      "status": "awaiting_confirmation"
    }
  }
}
```

### 4. 确认步骤

**POST** `/api/ai/workflow/:workflowId/step/:stepId/confirm`

用户确认当前步骤的结果。

**请求体:**
```json
{
  "approved": true
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "workflow": {
      "id": "workflow-abc123",
      "currentStepIndex": 1,
      "status": "awaiting_confirmation"
    },
    "nextStepReady": true
  }
}
```

如果 `approved: false`,工作流将被取消:
```json
{
  "success": true,
  "data": {
    "workflow": {
      "status": "cancelled"
    },
    "nextStepReady": false
  }
}
```

### 5. 跳过步骤

**POST** `/api/ai/workflow/:workflowId/step/:stepId/skip`

跳过当前步骤,继续下一步。

**响应:**
```json
{
  "success": true,
  "data": {
    "workflow": {
      "currentStepIndex": 1,
      "steps": [
        {
          "id": "step-1",
          "status": "skipped"
        }
      ]
    },
    "nextStepReady": true
  }
}
```

### 6. 取消工作流

**POST** `/api/ai/workflow/:workflowId/cancel`

取消整个工作流。

**响应:**
```json
{
  "success": true,
  "message": "Workflow cancelled"
}
```

### 7. 列出所有工作流

**GET** `/api/ai/workflow/list`

获取所有工作流的列表。

**响应:**
```json
{
  "success": true,
  "data": {
    "workflows": [
      {
        "id": "workflow-abc123",
        "mediaId": "video-123",
        "userRequest": "删除前10秒,然后加快2倍速度",
        "status": "completed",
        "createdAt": "2026-02-06T10:00:00Z"
      }
    ]
  }
}
```

### 8. 删除工作流

**DELETE** `/api/ai/workflow/:workflowId`

删除指定的工作流。

**响应:**
```json
{
  "success": true,
  "message": "Workflow deleted"
}
```

## 使用示例

### 完整流程示例

```typescript
// 1. 创建工作流
const createResponse = await fetch('/api/ai/workflow/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userRequest: '删除前10秒,然后加快2倍速度',
    mediaId: 'video-123',
    mediaInfo: { duration: 60, hasAudio: true }
  })
});

const { data: { workflow } } = await createResponse.json();
console.log(`Created workflow: ${workflow.id}`);
console.log(`Steps: ${workflow.steps.length}`);

// 2. 执行第一个步骤
const step1 = workflow.steps[0];
const executeResponse = await fetch(
  `/api/ai/workflow/${workflow.id}/step/${step1.id}/execute`,
  { method: 'POST' }
);

const { data: { step: { previewUrl } } } = await executeResponse.json();
console.log(`Preview ready: ${previewUrl}`);

// 3. 用户查看预览视频
// <video src={previewUrl} controls />

// 4. 用户确认
const confirmResponse = await fetch(
  `/api/ai/workflow/${workflow.id}/step/${step1.id}/confirm`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: true })
  }
);

const { data: { nextStepReady } } = await confirmResponse.json();

// 5. 如果有下一步,继续执行
if (nextStepReady) {
  const step2 = workflow.steps[1];
  await fetch(
    `/api/ai/workflow/${workflow.id}/step/${step2.id}/execute`,
    { method: 'POST' }
  );
  // ... 重复步骤3-4
}

// 6. 所有步骤完成后,获取最终结果
const statusResponse = await fetch(`/api/ai/workflow/${workflow.id}`);
const { data: { workflow: finalWorkflow } } = await statusResponse.json();

if (finalWorkflow.status === 'completed') {
  console.log(`Final output: ${finalWorkflow.finalOutputUrl}`);
}
```

## 工作流状态

- **planning**: 正在规划步骤
- **awaiting_confirmation**: 等待用户确认当前步骤
- **processing**: 正在执行步骤
- **completed**: 所有步骤已完成
- **cancelled**: 工作流已取消
- **failed**: 工作流执行失败

## 步骤状态

- **pending**: 等待执行
- **processing**: 正在执行
- **completed**: 已完成
- **failed**: 执行失败
- **skipped**: 已跳过

## 支持的编辑操作

1. **cut** - 删除指定时间段
   ```json
   {
     "type": "cut",
     "params": { "startTime": 0, "endTime": 10 }
   }
   ```

2. **trim** - 保留指定时间段
   ```json
   {
     "type": "trim",
     "params": { "startTime": 10, "endTime": 30 }
   }
   ```

3. **speed_change** - 改变播放速度
   ```json
   {
     "type": "speed_change",
     "params": { "speed": 2.0 }
   }
   ```

4. **add_text** - 添加文字
   ```json
   {
     "type": "add_text",
     "params": {
       "text": "Hello World",
       "fontsize": 48,
       "fontcolor": "white"
     }
   }
   ```

5. **filter** - 应用滤镜
   ```json
   {
     "type": "filter",
     "params": {
       "name": "blur|grayscale|brightness",
       "value": 0.5
     }
   }
   ```

## 错误处理

所有API端点遵循统一的错误格式:

```json
{
  "success": false,
  "error": "Error message here"
}
```

常见错误码:
- **400**: 请求参数错误
- **404**: 工作流或步骤不存在
- **409**: 状态冲突(如已完成的计划不能再次执行)
- **500**: 服务器内部错误

## 性能优化

1. **预览视频设置**: 使用 `ultrafast` preset 和较高CRF值(28)以加快预览生成
2. **增量处理**: 每个步骤基于上一步的输出,而非总是从原始文件开始
3. **并发限制**: 同一时间只执行一个步骤,避免资源竞争

## 最佳实践

1. **用户体验**:
   - 在执行步骤时显示加载指示器
   - 提供预览视频的快速导航
   - 允许用户随时取消

2. **错误恢复**:
   - 步骤失败时允许重试
   - 保存中间结果以支持回退

3. **资源管理**:
   - 完成后清理临时预览文件
   - 限制并发工作流数量

## 与非交互式编辑的对比

| 特性 | 交互式工作流 | 非交互式编排 |
|------|------------|------------|
| 用户控制 | 逐步确认 | 一次性执行 |
| 预览 | 每步预览 | 仅最终结果 |
| 灵活性 | 可调整/跳过 | 固定流程 |
| 速度 | 较慢(等待确认) | 较快 |
| 适用场景 | 复杂编辑 | 简单/批量 |

## 相关文档

- [视频编辑编排API](./specs/main/contracts/ai.md)
- [转录增强功能](./TRANSCRIPTION_ENHANCEMENTS.md)
- [FFmpeg参数说明](./backend/src/services/videoEditOrchestration.ts)
