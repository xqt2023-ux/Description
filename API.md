# Description API 文档

## 目录

- [概述](#概述)
- [认证](#认证)
- [媒体管理](#媒体管理)
- [转录服务](#转录服务)
- [AI 服务](#ai-服务)
- [工作流 API](#工作流-api)
- [错误处理](#错误处理)

---

## 概述

**Base URL**: `http://localhost:3001/api`

**Content-Type**: `application/json`

**当前版本**: v1 (未版本化)

---

## 认证

当前版本未实现认证系统。所有 API 端点均为开放访问。

**计划中**: JWT Token 认证（已配置但未实现）

---

## 媒体管理

### 上传媒体文件

上传视频或音频文件到服务器。

**端点**: `POST /api/media`

**Content-Type**: `multipart/form-data`

**请求参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `file` | File | ✅ | 视频或音频文件 (最大 500MB) |

**响应**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "my-video.mp4",
  "originalName": "my-video.mp4",
  "path": "/uploads/my-video.mp4",
  "size": 10485760,
  "mimeType": "video/mp4",
  "uploadedAt": "2026-02-14T12:00:00.000Z"
}
```

**状态码**:
- `200`: 上传成功
- `400`: 文件无效或缺失
- `413`: 文件过大
- `500`: 服务器错误

---

### 验证媒体文件

使用 FFprobe 验证媒体文件的有效性。

**端点**: `POST /api/media/validate`

**Content-Type**: `multipart/form-data`

**请求参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `file` | File | ✅ | 要验证的媒体文件 |

**响应**:

```json
{
  "valid": true,
  "metadata": {
    "duration": 120.5,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "codec": "h264",
    "audioCodec": "aac"
  }
}
```

**状态码**:
- `200`: 验证完成（检查 `valid` 字段）
- `400`: 请求无效

---

### 列出所有媒体

获取所有已上传的媒体文件列表。

**端点**: `GET /api/media`

**响应**:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "video1.mp4",
    "originalName": "My Video.mp4",
    "size": 10485760,
    "uploadedAt": "2026-02-14T12:00:00.000Z"
  }
]
```

---

### 获取媒体详情

**端点**: `GET /api/media/:id`

**路径参数**:
- `id`: 媒体文件 ID

**响应**: 同上传响应

**状态码**:
- `200`: 成功
- `404`: 媒体不存在

---

### 删除媒体

**端点**: `DELETE /api/media/:id`

**状态码**:
- `200`: 删除成功
- `404`: 媒体不存在

---

## 转录服务

### 创建转录任务

启动视频/音频的转录任务。

**端点**: `POST /api/transcriptions/start`

**请求体**:

```json
{
  "mediaId": "550e8400-e29b-41d4-a716-446655440000",
  "language": "zh",
  "provider": "groq"
}
```

**参数说明**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `mediaId` | string | ✅ | 媒体文件 ID |
| `language` | string | ❌ | 语言代码（默认自动检测） |
| `provider` | string | ❌ | 转录提供商: `groq` (默认) 或 `openai` |

**响应**:

```json
{
  "id": "transcription-123",
  "mediaId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 0,
  "createdAt": "2026-02-14T12:00:00.000Z"
}
```

**状态码**:
- `200`: 任务已创建
- `400`: 参数无效
- `404`: 媒体文件不存在

---

### 获取转录状态

**端点**: `GET /api/transcriptions/:id/status`

**响应**:

```json
{
  "id": "transcription-123",
  "status": "completed",
  "progress": 100,
  "result": {
    "text": "完整的转录文本...",
    "segments": [
      {
        "id": "seg-1",
        "start": 0.0,
        "end": 2.5,
        "text": "第一句话",
        "words": [
          {
            "word": "第一",
            "start": 0.0,
            "end": 0.5
          }
        ]
      }
    ],
    "language": "zh"
  }
}
```

**状态值**:
- `queued`: 队列中
- `processing`: 处理中
- `completed`: 完成
- `failed`: 失败

---

### SSE 实时推送

订阅转录进度的实时更新。

**端点**: `GET /api/transcriptions/:id/stream`

**Content-Type**: `text/event-stream`

**事件格式**:

```
event: progress
data: {"progress": 45, "status": "processing"}

event: complete
data: {"status": "completed", "result": {...}}

event: error
data: {"error": "转录失败"}
```

---

## AI 服务

### 通用 AI 对话

**端点**: `POST /api/ai/chat`

**请求体**:

```json
{
  "message": "请帮我总结这段视频",
  "context": {
    "transcriptId": "transcript-123"
  }
}
```

**响应**:

```json
{
  "response": "这段视频讨论了...",
  "model": "claude-sonnet-4-20250514"
}
```

---

### 移除填充词

从转录文本中移除填充词（"嗯"、"啊"、"那个"等）。

**端点**: `POST /api/ai/remove-fillers`

**请求体**:

```json
{
  "transcriptId": "transcript-123",
  "language": "zh"
}
```

**响应**:

```json
{
  "original": "嗯，我觉得，那个，这个很好",
  "cleaned": "我觉得这个很好",
  "removedCount": 3,
  "segments": [...]
}
```

---

### 生成摘要

**端点**: `POST /api/ai/summarize`

**请求体**:

```json
{
  "transcriptId": "transcript-123",
  "length": "short"
}
```

**参数**:
- `length`: `short` | `medium` | `long`

---

### 生成章节标记

**端点**: `POST /api/ai/generate-chapters`

**响应**:

```json
{
  "chapters": [
    {
      "title": "介绍",
      "start": 0,
      "end": 30.5
    },
    {
      "title": "主要内容",
      "start": 30.5,
      "end": 120.0
    }
  ]
}
```

---

## 工作流 API

交互式编辑工作流系统（预览 + 确认模式）。

### 创建工作流

**端点**: `POST /api/ai/workflow/create`

**请求体**:

```json
{
  "userRequest": "移除所有填充词并添加背景音乐",
  "mediaId": "550e8400-e29b-41d4-a716-446655440000",
  "mediaInfo": {
    "duration": 120.5,
    "hasAudio": true,
    "hasVideo": true
  }
}
```

**响应**:

```json
{
  "workflowId": "workflow-123",
  "steps": [
    {
      "id": "step-1",
      "type": "remove_fillers",
      "description": "移除填充词",
      "status": "pending",
      "requiresConfirmation": true
    },
    {
      "id": "step-2",
      "type": "add_music",
      "description": "添加背景音乐",
      "status": "pending",
      "requiresConfirmation": true
    }
  ],
  "currentStep": 0,
  "status": "created"
}
```

---

### 执行工作流步骤

**端点**: `POST /api/ai/workflow/:workflowId/step/:stepId/execute`

**响应**:

```json
{
  "stepId": "step-1",
  "status": "completed",
  "preview": {
    "type": "video",
    "url": "/api/workflow/preview/preview-abc123.mp4",
    "metadata": {
      "removedWords": 15,
      "duration": 115.2
    }
  },
  "requiresConfirmation": true
}
```

---

### 确认/拒绝步骤

**端点**: `POST /api/ai/workflow/:workflowId/step/:stepId/confirm`

**请求体**:

```json
{
  "approved": true,
  "feedback": "效果很好"
}
```

**响应**:

```json
{
  "stepId": "step-1",
  "status": "confirmed",
  "nextStep": "step-2"
}
```

---

### 跳过步骤

**端点**: `POST /api/ai/workflow/:workflowId/step/:stepId/skip`

---

### 撤销步骤

**端点**: `POST /api/ai/workflow/:workflowId/undo`

回退到上一个步骤。

---

### 取消工作流

**端点**: `POST /api/ai/workflow/:workflowId/cancel`

---

### 列出工作流

**端点**: `GET /api/ai/workflow/list`

**响应**:

```json
[
  {
    "workflowId": "workflow-123",
    "createdAt": "2026-02-14T12:00:00.000Z",
    "status": "in_progress",
    "currentStep": 1,
    "totalSteps": 3
  }
]
```

---

## 错误处理

### 标准错误响应

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "mediaId",
      "issue": "Required field missing"
    }
  }
}
```

### 错误代码

| 代码 | HTTP 状态 | 描述 |
|------|-----------|------|
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `UNAUTHORIZED` | 401 | 未授权（未实现） |
| `FILE_TOO_LARGE` | 413 | 文件超过大小限制 |
| `TRANSCRIPTION_FAILED` | 500 | 转录服务失败 |
| `AI_SERVICE_ERROR` | 500 | AI 服务调用失败 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 速率限制

**当前**: 无速率限制

**计划中**:
- 未认证用户: 10 req/min
- 认证用户: 60 req/min

---

## 示例代码

### JavaScript/TypeScript (Fetch)

```typescript
// 上传文件
const formData = new FormData();
formData.append('file', fileBlob);

const response = await fetch('http://localhost:3001/api/media', {
  method: 'POST',
  body: formData,
});

const media = await response.json();

// 创建转录
const transcription = await fetch('http://localhost:3001/api/transcriptions/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaId: media.id,
    provider: 'groq',
  }),
});

// 订阅实时更新
const eventSource = new EventSource(
  `http://localhost:3001/api/transcriptions/${transcription.id}/stream`
);

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  console.log('Progress:', data.progress);
});

eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data);
  console.log('Transcription:', data.result);
  eventSource.close();
});
```

---

## 变更日志

### v1 (当前)
- 初始 API 版本
- 媒体管理
- 转录服务（Groq + OpenAI）
- AI 功能（Claude 集成）
- 交互式工作流（部分实现）

### 即将推出
- JWT 认证
- 速率限制
- WebSocket 实时更新
- 批量操作
- 视频导出 API
