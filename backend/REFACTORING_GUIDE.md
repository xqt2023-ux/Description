# 错误处理重构指南

## 概述

项目已实现统一的错误处理系统，但部分路由（特别是 `routes/ai.ts`）仍在使用旧的错误处理模式。本指南说明如何将旧模式迁移到新模式。

---

## 错误处理架构

### 核心组件

1. **`middleware/errorHandler.ts`**
   - `ErrorCode` 枚举 - 标准化错误代码
   - `AppError` 类 - 自定义错误类
   - `Errors` 工厂 - 便捷的错误创建方法
   - `errorHandler` 中间件 - 统一错误响应

2. **`utils/asyncHandler.ts`**
   - `asyncHandler` 包装器 - 自动捕获异步错误

### 标准错误响应格式

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "retryable": true,
  "retryAfter": 5,
  "details": {}
}
```

---

## 迁移模式

### ❌ 旧模式（需要替换）

```typescript
router.post('/endpoint', async (req: Request, res: Response) => {
  try {
    const { param } = req.body;

    // 验证错误
    if (!param) {
      return res.status(400).json({
        success: false,
        error: 'Param is required',
      });
    }

    const result = await someAsyncOperation(param);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Operation failed',
    });
  }
});
```

### ✅ 新模式（推荐）

```typescript
import { asyncHandler } from '../utils/asyncHandler';
import { Errors } from '../middleware/errorHandler';

router.post('/endpoint', asyncHandler(async (req: Request, res: Response) => {
  const { param } = req.body;

  // 验证错误 - 直接抛出
  if (!param) {
    throw Errors.validation('Param is required');
  }

  const result = await someAsyncOperation(param);

  res.json({
    success: true,
    data: result,
  });
}));
```

**关键变化**：
1. 使用 `asyncHandler()` 包装路由处理器
2. 移除 `try/catch` 块
3. 使用 `throw Errors.xxx()` 替代 `res.status().json()`
4. 异步错误会自动传递到错误处理中间件

---

## 错误类型映射

### 验证错误 (400)

```typescript
// 旧
if (!param) {
  return res.status(400).json({ success: false, error: 'Param required' });
}

// 新
if (!param) {
  throw Errors.validation('Param required');
}

// 带详情
throw Errors.validation('Invalid input', {
  field: 'email',
  issue: 'Invalid format'
});
```

### 资源不存在 (404)

```typescript
// 旧
return res.status(404).json({ success: false, error: 'User not found' });

// 新
throw Errors.notFound('User');
```

### 未授权 (401)

```typescript
// 旧
return res.status(401).json({ success: false, error: 'Unauthorized' });

// 新
throw Errors.unauthorized();
// 或
throw Errors.unauthorized('Invalid token');
```

### 禁止访问 (403)

```typescript
// 新
throw Errors.forbidden();
// 或
throw Errors.forbidden('Insufficient permissions');
```

### 文件错误

```typescript
// 文件过大
throw Errors.fileTooLarge('100MB');

// 文件类型无效
throw Errors.invalidFileType(['video/mp4', 'video/webm']);
```

### 外部服务错误 (502)

```typescript
// 旧
res.status(500).json({ error: 'OpenAI API failed' });

// 新
throw Errors.externalApiError('OpenAI', 'API quota exceeded');
```

### FFmpeg 错误

```typescript
throw Errors.ffmpegError('Failed to extract audio: Invalid codec');
```

### 转录错误

```typescript
throw Errors.transcriptionFailed('Groq API timeout');
```

### 服务不可用 (503)

```typescript
throw Errors.serviceUnavailable();
// 或
throw Errors.serviceUnavailable('Database connection pool exhausted');
```

---

## 重构步骤

### 1. 导入必要的工具

```typescript
import { asyncHandler } from '../utils/asyncHandler';
import { Errors } from '../middleware/errorHandler';
```

### 2. 包装路由处理器

```typescript
// 之前
router.post('/path', async (req, res) => { ... });

// 之后
router.post('/path', asyncHandler(async (req, res) => { ... }));
```

### 3. 移除 try/catch

```typescript
// 移除
try {
  // ...
} catch (error) {
  res.status(500).json({ ... });
}

// 保留业务逻辑
```

### 4. 替换验证错误

```typescript
// 查找所有
if (!condition) {
  return res.status(400).json({ ... });
}

// 替换为
if (!condition) {
  throw Errors.validation('...');
}
```

### 5. 替换其他错误

根据上面的错误类型映射表替换所有 `res.status(xxx).json()` 调用。

---

## 待重构文件

### 高优先级

- [x] `routes/media.ts` - ✅ 已完成
- [x] `routes/transcription.ts` - ✅ 已完成
- [ ] **`routes/ai.ts`** - ⚠️ 部分完成（1/30+ 端点）
  - 已重构: `/chat`
  - 待重构: `/skills/:skillName`, `/plan`, `/execute-task` 等 ~25 个端点

### 中优先级

- [x] `routes/export.ts` - ✅ 已完成
- [x] `routes/projects.ts` - ✅ 已完成
- [x] `routes/jobs.ts` - ✅ 已完成

---

## 常见问题

### Q: 何时使用 asyncHandler？

**A**: 所有异步路由处理器（使用 `async` 关键字的）都应该使用 `asyncHandler`。

### Q: 同步路由怎么办？

**A**: 同步路由不需要 `asyncHandler`，但仍应使用 `throw Errors.xxx()`：

```typescript
router.get('/sync', (req, res) => {
  if (!condition) {
    throw Errors.validation('...');
  }
  res.json({ data });
});
```

Express 会自动捕获同步路由中的错误。

### Q: 需要自定义错误响应怎么办？

**A**: 直接抛出 `AppError`：

```typescript
import { AppError, ErrorCode } from '../middleware/errorHandler';

throw new AppError(
  'Custom error message',
  422,  // 状态码
  ErrorCode.VALIDATION_ERROR,
  { customField: 'value' }  // 详情
);
```

### Q: 如何处理第三方库的错误？

**A**: 在服务层捕获并转换：

```typescript
// services/openai.ts
try {
  const result = await openai.chat.completions.create(...);
  return result;
} catch (error: any) {
  if (error.status === 429) {
    throw Errors.externalApiError('OpenAI', 'Rate limit exceeded');
  }
  throw Errors.externalApiError('OpenAI', error.message);
}
```

### Q: 日志记录怎么办？

**A**: `errorHandler` 中间件已经记录所有错误。路由中不需要 `console.error()`。如需额外日志，在抛出错误前记录：

```typescript
console.log('Processing request with params:', req.body);
const result = await operation();
// 错误会自动被记录
```

---

## 验证重构

### 1. TypeScript 编译

```bash
cd backend
npx tsc --noEmit
```

应该没有类型错误。

### 2. 运行测试

```bash
npm test
```

确保所有测试通过。

### 3. 手动测试

使用 API 客户端测试各个端点，验证错误响应格式：

```bash
# 应该返回标准错误格式
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{}'

# 期望响应
{
  "success": false,
  "error": "Messages array is required",
  "code": "VALIDATION_ERROR",
  "retryable": false
}
```

---

## 示例：重构 ai.ts 的 /skills/:skillName

### 重构前

```typescript
router.post('/skills/:skillName', async (req: Request, res: Response) => {
  try {
    const { skillName } = req.params;
    const { transcript, targetLanguage } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required',
      });
    }

    switch (skillName) {
      case 'translate':
        if (!targetLanguage) {
          return res.status(400).json({
            success: false,
            error: 'Target language is required',
          });
        }
        result = await translateTranscript(transcript, targetLanguage);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown skill: ${skillName}`,
        });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

### 重构后

```typescript
router.post('/skills/:skillName', asyncHandler(async (req: Request, res: Response) => {
  const { skillName } = req.params;
  const { transcript, targetLanguage } = req.body;

  if (!transcript) {
    throw Errors.validation('Transcript is required');
  }

  let result;

  switch (skillName) {
    case 'translate':
      if (!targetLanguage) {
        throw Errors.validation('Target language is required for translation');
      }
      result = await translateTranscript(transcript, targetLanguage);
      break;
    default:
      throw Errors.validation(`Unknown skill: ${skillName}`, {
        availableSkills: ['remove-filler-words', 'translate', '...']
      });
  }

  res.json({ success: true, data: result });
}));
```

---

## 进度跟踪

**ai.ts 重构进度**: 1/30 端点（3%）

下次重构时，从以下端点继续：
1. `POST /skills/:skillName`
2. `POST /plan`
3. `POST /execute-task`
4. `POST /execute-workflow`
5. ...（参见文件中的所有端点）

---

## 最佳实践

1. ✅ **一次重构一个端点** - 易于测试和回滚
2. ✅ **测试每个端点** - 确保错误响应格式正确
3. ✅ **提交小批量** - 便于代码审查
4. ✅ **更新测试** - 验证新的错误响应格式
5. ✅ **文档化特殊情况** - 记录任何非标准错误处理

---

## 相关文件

- `backend/src/middleware/errorHandler.ts` - 错误处理核心
- `backend/src/utils/asyncHandler.ts` - 异步包装器
- `backend/src/routes/media.ts` - 重构完成的示例
- `backend/src/routes/ai.ts` - 需要重构的主要文件
