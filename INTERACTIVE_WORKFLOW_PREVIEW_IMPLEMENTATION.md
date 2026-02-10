# 交互式工作流预览功能实现指南

## 📋 概述

本文档详细说明如何实现交互式编辑工作流的预览功能，让用户能够在每个编辑步骤完成后看到预览视频，并确认是否继续。

**当前状态**: 
- ✅ 前端UI完整（InteractiveWorkflowSidebar）
- ✅ API路由已设置（backend/src/routes/ai.ts）
- ❌ 后端核心逻辑未实现（executeWorkflowStep, confirmStep等）

**目标**: 实现后端核心逻辑，让预览播放器能够显示每步编辑效果

---

## 🎯 核心需求

### 用户场景
```
1. 用户输入: "删除前10秒，然后加快2倍速度"
2. AI分解任务: [步骤1: 删除0-10秒] [步骤2: 加快2倍]
3. 自动执行步骤1 → 生成preview-step1.mp4
4. 前端播放器显示预览
5. 用户点击"确认并继续"
6. 执行步骤2 → 生成preview-step2.mp4
7. 用户确认 → 完成，得到最终视频
```

### 技术要点
- **增量处理**: 步骤2基于步骤1的输出，而非原始视频
- **快速预览**: 使用FFmpeg的`ultrafast` preset和CRF 28
- **状态管理**: 工作流状态机，确保流程正确

---

## 📂 文件结构

```
backend/src/services/
├── interactiveEditWorkflow.ts     # 核心逻辑（需实现）
├── videoEditOrchestration.ts      # 视频编辑（已存在）
└── videoProcessing.ts             # FFmpeg工具（已存在）

backend/src/__tests__/
└── interactiveEditWorkflow.test.ts # 测试用例（需完善）

backend/src/routes/
└── ai.ts                          # API路由（已存在）
```

---

## 🔧 实现步骤（TDD方式）

### Step 1: 完善类型定义

**文件**: `backend/src/services/interactiveEditWorkflow.ts`

```typescript
// 扩展WorkflowStep类型
export interface WorkflowStep {
  id: string;
  stepNumber: number;
  instruction: EditInstruction;  // 新增
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  requiresConfirmation: boolean;
  previewPath?: string;           // 新增：预览文件路径
  previewUrl?: string;            // 新增：预览URL（相对路径）
  error?: string;                 // 新增：错误信息
  startedAt?: string;             // 新增：开始时间
  completedAt?: string;           // 新增：完成时间
  userApproved?: boolean;         // 新增：用户是否确认
}

// 编辑指令类型
export interface EditInstruction {
  type: 'cut' | 'trim' | 'speed_change' | 'add_text' | 'filter';
  params: Record<string, any>;
  startTime?: number;
  endTime?: number;
  description: string;
}

// 扩展InteractiveWorkflow类型
export interface InteractiveWorkflow {
  id: string;
  mediaId: string;
  sourceFilePath: string;
  userRequest: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  status: 'planning' | 'awaiting_confirmation' | 'processing' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  updatedAt: string;
  finalOutputPath?: string;       // 新增：最终输出路径
  finalOutputUrl?: string;         // 新增：最终输出URL
}
```

---

### Step 2: 实现executeWorkflowStep（核心功能）

**功能**: 执行工作流中的一个步骤，生成预览视频

#### 2.1 编写测试

**文件**: `backend/src/__tests__/interactiveEditWorkflow.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInteractiveWorkflow,
  executeWorkflowStep,
  getWorkflow
} from '../services/interactiveEditWorkflow';

describe('executeWorkflowStep', () => {
  let workflow: any;
  
  beforeEach(async () => {
    // 创建测试工作流
    const result = await createInteractiveWorkflow(
      '删除前5秒',
      'test-media',
      '/uploads/test-video.mp4',
      { duration: 60, hasAudio: true }
    );
    workflow = result.workflow;
    
    // 添加测试步骤
    workflow.steps = [{
      id: 'step-1',
      stepNumber: 1,
      instruction: {
        type: 'cut',
        params: { startTime: 0, endTime: 5 },
        description: '删除前5秒'
      },
      status: 'pending',
      requiresConfirmation: true
    }];
  });

  it('should execute step and generate preview', async () => {
    const result = await executeWorkflowStep(workflow.id, 'step-1');
    
    expect(result.success).toBe(true);
    expect(result.step.previewPath).toBeDefined();
    expect(result.step.previewUrl).toBeDefined();
    expect(result.step.status).toBe('completed');
  });

  it('should update workflow status', async () => {
    await executeWorkflowStep(workflow.id, 'step-1');
    
    const updated = getWorkflow(workflow.id);
    expect(updated?.steps[0].status).toBe('completed');
    expect(updated?.status).toBe('awaiting_confirmation');
  });

  it('should handle non-existent workflow', async () => {
    const result = await executeWorkflowStep('fake-id', 'step-1');
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Workflow not found');
  });

  it('should handle non-existent step', async () => {
    const result = await executeWorkflowStep(workflow.id, 'fake-step');
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Step not found');
  });
});
```

#### 2.2 实现逻辑

**文件**: `backend/src/services/interactiveEditWorkflow.ts`

```typescript
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { orchestrateEditPipeline } from './videoEditOrchestration';

/**
 * 执行工作流步骤
 */
export async function executeWorkflowStep(
  workflowId: string,
  stepId: string
): Promise<{
  success: boolean;
  step?: any;
  workflow?: any;
  error?: string;
}> {
  // 1. 获取工作流
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. 查找步骤
  const stepIndex = workflow.steps.findIndex(s => s.id === stepId);
  if (stepIndex === -1) {
    return { success: false, error: 'Step not found' };
  }

  const step = workflow.steps[stepIndex];

  // 3. 检查步骤状态
  if (step.status !== 'pending') {
    return {
      success: false,
      error: `Step already ${step.status}`
    };
  }

  try {
    // 4. 更新状态为processing
    step.status = 'processing';
    step.startedAt = new Date().toISOString();
    workflow.updatedAt = new Date().toISOString();

    // 5. 确定输入文件
    // 如果是第一步，使用原始文件；否则使用上一步的预览
    let inputPath: string;
    if (stepIndex === 0) {
      inputPath = workflow.sourceFilePath;
    } else {
      const prevStep = workflow.steps[stepIndex - 1];
      if (!prevStep.previewPath) {
        throw new Error('Previous step has no preview');
      }
      inputPath = prevStep.previewPath;
    }

    // 6. 生成预览文件路径
    const previewFilename = `preview-${workflowId}-step${step.stepNumber}.mp4`;
    const previewPath = path.join('uploads', 'previews', previewFilename);
    
    // 确保预览目录存在
    const previewDir = path.join('uploads', 'previews');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    // 7. 根据指令类型调用相应的编辑函数
    const instruction = step.instruction;
    let outputPath: string;

    switch (instruction.type) {
      case 'cut':
        // 删除指定时间段
        outputPath = await executeCutInstruction(
          inputPath,
          previewPath,
          instruction.params
        );
        break;

      case 'trim':
        // 保留指定时间段
        outputPath = await executeTrimInstruction(
          inputPath,
          previewPath,
          instruction.params
        );
        break;

      case 'speed_change':
        // 改变速度
        outputPath = await executeSpeedChangeInstruction(
          inputPath,
          previewPath,
          instruction.params
        );
        break;

      case 'add_text':
        // 添加文字
        outputPath = await executeAddTextInstruction(
          inputPath,
          previewPath,
          instruction.params
        );
        break;

      case 'filter':
        // 应用滤镜
        outputPath = await executeFilterInstruction(
          inputPath,
          previewPath,
          instruction.params
        );
        break;

      default:
        throw new Error(`Unsupported instruction type: ${instruction.type}`);
    }

    // 8. 更新步骤状态
    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    step.previewPath = outputPath;
    step.previewUrl = `/api/workflow/preview/${previewFilename}`;
    workflow.status = 'awaiting_confirmation';
    workflow.updatedAt = new Date().toISOString();

    // 9. 返回结果
    return {
      success: true,
      step: {
        ...step,
        previewPath: outputPath,
        previewUrl: step.previewUrl,
      },
      workflow: {
        id: workflow.id,
        status: workflow.status,
        currentStepIndex: workflow.currentStepIndex,
      }
    };

  } catch (error: any) {
    // 10. 错误处理
    step.status = 'failed';
    step.error = error.message;
    workflow.status = 'failed';
    workflow.updatedAt = new Date().toISOString();

    return {
      success: false,
      error: error.message,
      step,
      workflow
    };
  }
}

/**
 * 执行cut指令 - 删除指定时间段
 */
async function executeCutInstruction(
  inputPath: string,
  outputPath: string,
  params: { startTime: number; endTime: number }
): Promise<string> {
  const { startTime, endTime } = params;
  
  // 使用orchestrateEditPipeline
  const result = await orchestrateEditPipeline([
    {
      type: 'cut',
      params: { startTime, endTime }
    }
  ], inputPath, {
    preset: 'ultrafast',  // 快速预览
    crf: 28,              // 较高压缩
  });

  if (!result.success) {
    throw new Error(result.error || 'Cut failed');
  }

  // 移动到预览位置
  fs.renameSync(result.outputPath!, outputPath);
  return outputPath;
}

/**
 * 执行trim指令 - 保留指定时间段
 */
async function executeTrimInstruction(
  inputPath: string,
  outputPath: string,
  params: { startTime: number; endTime: number }
): Promise<string> {
  const { startTime, endTime } = params;
  
  const result = await orchestrateEditPipeline([
    {
      type: 'trim',
      params: { startTime, endTime }
    }
  ], inputPath, {
    preset: 'ultrafast',
    crf: 28,
  });

  if (!result.success) {
    throw new Error(result.error || 'Trim failed');
  }

  fs.renameSync(result.outputPath!, outputPath);
  return outputPath;
}

/**
 * 执行speed_change指令 - 改变播放速度
 */
async function executeSpeedChangeInstruction(
  inputPath: string,
  outputPath: string,
  params: { speed: number }
): Promise<string> {
  const { speed } = params;
  
  const result = await orchestrateEditPipeline([
    {
      type: 'speed_change',
      params: { speed }
    }
  ], inputPath, {
    preset: 'ultrafast',
    crf: 28,
  });

  if (!result.success) {
    throw new Error(result.error || 'Speed change failed');
  }

  fs.renameSync(result.outputPath!, outputPath);
  return outputPath;
}

/**
 * 执行add_text指令 - 添加文字
 */
async function executeAddTextInstruction(
  inputPath: string,
  outputPath: string,
  params: { text: string; fontsize?: number; fontcolor?: string }
): Promise<string> {
  const result = await orchestrateEditPipeline([
    {
      type: 'add_text',
      params
    }
  ], inputPath, {
    preset: 'ultrafast',
    crf: 28,
  });

  if (!result.success) {
    throw new Error(result.error || 'Add text failed');
  }

  fs.renameSync(result.outputPath!, outputPath);
  return outputPath;
}

/**
 * 执行filter指令 - 应用滤镜
 */
async function executeFilterInstruction(
  inputPath: string,
  outputPath: string,
  params: { name: string; value?: number }
): Promise<string> {
  const result = await orchestrateEditPipeline([
    {
      type: 'filter',
      params
    }
  ], inputPath, {
    preset: 'ultrafast',
    crf: 28,
  });

  if (!result.success) {
    throw new Error(result.error || 'Filter failed');
  }

  fs.renameSync(result.outputPath!, outputPath);
  return outputPath;
}
```

---

### Step 3: 实现confirmStep

**功能**: 用户确认当前步骤，移动到下一步或完成工作流

#### 3.1 编写测试

```typescript
describe('confirmStep', () => {
  it('should approve step and move to next', async () => {
    // 执行并完成第一步
    await executeWorkflowStep(workflow.id, 'step-1');
    
    // 确认
    const result = await confirmStep(workflow.id, 'step-1', true);
    
    expect(result.success).toBe(true);
    expect(result.workflow.currentStepIndex).toBe(1);
    
    const step = result.workflow.steps[0];
    expect(step.userApproved).toBe(true);
  });

  it('should cancel workflow if rejected', async () => {
    await executeWorkflowStep(workflow.id, 'step-1');
    
    const result = await confirmStep(workflow.id, 'step-1', false);
    
    expect(result.success).toBe(true);
    expect(result.workflow.status).toBe('cancelled');
    expect(result.nextStepReady).toBe(false);
  });

  it('should complete workflow when last step approved', async () => {
    // 只有一步的工作流
    await executeWorkflowStep(workflow.id, 'step-1');
    
    const result = await confirmStep(workflow.id, 'step-1', true);
    
    expect(result.workflow.status).toBe('completed');
    expect(result.workflow.finalOutputPath).toBeDefined();
  });
});
```

#### 3.2 实现逻辑

```typescript
/**
 * 确认步骤
 */
export async function confirmStep(
  workflowId: string,
  stepId: string,
  approved: boolean
): Promise<{
  success: boolean;
  workflow?: any;
  nextStepReady?: boolean;
  error?: string;
}> {
  // 1. 获取工作流
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. 查找步骤
  const step = workflow.steps.find(s => s.id === stepId);
  if (!step) {
    return { success: false, error: 'Step not found' };
  }

  // 3. 检查步骤状态
  if (step.status !== 'completed') {
    return {
      success: false,
      error: 'Step not completed yet'
    };
  }

  // 4. 记录用户确认
  step.userApproved = approved;
  workflow.updatedAt = new Date().toISOString();

  // 5. 如果拒绝，取消工作流
  if (!approved) {
    workflow.status = 'cancelled';
    return {
      success: true,
      workflow,
      nextStepReady: false
    };
  }

  // 6. 如果批准，移动到下一步
  workflow.currentStepIndex++;

  // 7. 检查是否完成所有步骤
  if (workflow.currentStepIndex >= workflow.steps.length) {
    workflow.status = 'completed';
    
    // 最后一步的预览就是最终输出
    const lastStep = workflow.steps[workflow.steps.length - 1];
    workflow.finalOutputPath = lastStep.previewPath;
    workflow.finalOutputUrl = lastStep.previewUrl;

    return {
      success: true,
      workflow,
      nextStepReady: false
    };
  }

  // 8. 还有下一步
  workflow.status = 'awaiting_confirmation';
  
  return {
    success: true,
    workflow,
    nextStepReady: true
  };
}
```

---

### Step 4: 实现undo功能

**功能**: 回退到上一步

```typescript
/**
 * 回退到上一步
 */
export async function undoStep(
  workflowId: string
): Promise<{
  success: boolean;
  workflow?: any;
  error?: string;
}> {
  // 1. 获取工作流
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. 检查是否可以回退
  if (workflow.currentStepIndex === 0) {
    return {
      success: false,
      error: 'Cannot undo from first step'
    };
  }

  // 3. 回退
  workflow.currentStepIndex--;
  
  // 4. 清除当前步骤的状态
  const currentStep = workflow.steps[workflow.currentStepIndex];
  currentStep.status = 'pending';
  currentStep.userApproved = undefined;
  currentStep.startedAt = undefined;
  currentStep.completedAt = undefined;
  currentStep.error = undefined;
  
  // 5. 删除预览文件（可选）
  if (currentStep.previewPath && fs.existsSync(currentStep.previewPath)) {
    fs.unlinkSync(currentStep.previewPath);
  }
  currentStep.previewPath = undefined;
  currentStep.previewUrl = undefined;

  // 6. 更新工作流状态
  workflow.status = 'awaiting_confirmation';
  workflow.updatedAt = new Date().toISOString();

  return {
    success: true,
    workflow
  };
}
```

---

### Step 5: 实现skipStep

**功能**: 跳过当前步骤

```typescript
/**
 * 跳过步骤
 */
export async function skipStep(
  workflowId: string,
  stepId: string
): Promise<{
  success: boolean;
  workflow?: any;
  nextStepReady?: boolean;
  error?: string;
}> {
  // 1. 获取工作流
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. 查找步骤
  const step = workflow.steps.find(s => s.id === stepId);
  if (!step) {
    return { success: false, error: 'Step not found' };
  }

  // 3. 标记为skipped
  step.status = 'skipped';
  workflow.currentStepIndex++;
  workflow.updatedAt = new Date().toISOString();

  // 4. 检查是否完成
  if (workflow.currentStepIndex >= workflow.steps.length) {
    workflow.status = 'completed';
    return {
      success: true,
      workflow,
      nextStepReady: false
    };
  }

  workflow.status = 'awaiting_confirmation';
  return {
    success: true,
    workflow,
    nextStepReady: true
  };
}
```

---

### Step 6: 实现cancelWorkflow

```typescript
/**
 * 取消工作流
 */
export function cancelWorkflow(workflowId: string): boolean {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return false;
  }

  workflow.status = 'cancelled';
  workflow.updatedAt = new Date().toISOString();
  
  return true;
}
```

---

### Step 7: 添加预览文件服务

**文件**: `backend/src/routes/ai.ts`

需要添加一个新的路由来服务预览文件：

```typescript
// 在ai.ts中添加
router.get('/workflow/preview/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join('uploads', 'previews', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'Preview not found'
    });
  }

  res.sendFile(path.resolve(filePath));
});
```

---

## 🧪 测试

### 运行测试

```bash
cd backend
npm test -- interactiveEditWorkflow
```

### 手动测试流程

```bash
# 1. 启动服务器
cd backend && npm run dev

# 2. 创建工作流
curl -X POST http://localhost:3001/api/ai/workflow/create \
  -H "Content-Type: application/json" \
  -d '{
    "userRequest": "删除前5秒",
    "mediaId": "test-123",
    "mediaInfo": {"duration": 60, "hasAudio": true}
  }'

# 3. 执行步骤
curl -X POST http://localhost:3001/api/ai/workflow/WORKFLOW_ID/step/STEP_ID/execute

# 4. 查看预览
# 在浏览器打开: http://localhost:3001/api/workflow/preview/preview-xxx-step1.mp4

# 5. 确认步骤
curl -X POST http://localhost:3001/api/ai/workflow/WORKFLOW_ID/step/STEP_ID/confirm \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

---

## ⚠️ 注意事项

### 1. 文件管理

- **预览文件位置**: `uploads/previews/`
- **命名格式**: `preview-{workflowId}-step{stepNumber}.mp4`
- **清理策略**: 工作流完成或取消后，可以删除预览文件

### 2. 性能优化

```typescript
// FFmpeg预览参数
{
  preset: 'ultrafast',  // 最快编码速度
  crf: 28,             // 较高压缩率（质量略低）
  resolution: '720p'   // 可选：降低分辨率
}
```

### 3. 错误处理

- FFmpeg失败时，标记步骤为`failed`
- 保存错误信息到`step.error`
- 允许用户重试失败的步骤

### 4. 并发控制

```typescript
// 可选：添加锁机制，防止同时执行多个步骤
const executingSteps = new Set<string>();

async function executeWorkflowStep(workflowId: string, stepId: string) {
  const key = `${workflowId}-${stepId}`;
  if (executingSteps.has(key)) {
    return { success: false, error: 'Step already executing' };
  }
  
  executingSteps.add(key);
  try {
    // ... 执行逻辑
  } finally {
    executingSteps.delete(key);
  }
}
```

---

## 📝 待优化功能

### Phase 2 功能（可选）

1. **进度通知**
   - WebSocket实时推送执行进度
   - 显示FFmpeg处理百分比

2. **预览缓存**
   - 缓存已生成的预览
   - 避免重复执行

3. **批量操作**
   - 一次确认多个步骤
   - 自动执行所有步骤

4. **智能建议**
   - AI分析编辑效果
   - 建议调整参数

---

## ✅ 验收标准

功能完成的标准：

- [ ] 所有测试通过
- [ ] 前端能触发工作流创建
- [ ] 步骤自动执行并生成预览
- [ ] 预览播放器显示视频
- [ ] 用户可以确认/拒绝/跳过
- [ ] 工作流可以回退
- [ ] 完成后可下载最终视频
- [ ] 错误处理完善
- [ ] 代码有注释

---

## 🚀 部署检查清单

- [ ] 确保`uploads/previews`目录存在且可写
- [ ] FFmpeg已安装且可用
- [ ] 磁盘空间足够（预览文件可能较大）
- [ ] 配置文件清理策略（定期删除旧预览）
- [ ] 监控FFmpeg进程（防止僵尸进程）

---

## 📚 相关文档

- [INTERACTIVE_WORKFLOW_API.md](./INTERACTIVE_WORKFLOW_API.md) - API规范
- [videoEditOrchestration.ts](./backend/src/services/videoEditOrchestration.ts) - 视频编辑服务
- [InteractiveWorkflowSidebar.tsx](./frontend/src/components/editor/InteractiveWorkflowSidebar.tsx) - 前端组件

---

## 🆘 常见问题

### Q: 预览生成很慢怎么办？
A: 检查FFmpeg参数，确保使用了`ultrafast` preset。可以进一步降低分辨率或提高CRF值。

### Q: 预览文件太大怎么办？
A: 提高CRF值（28-32），降低分辨率到720p或480p。

### Q: 如何调试FFmpeg命令？
A: 在executeWorkflowStep中添加console.log，输出FFmpeg命令，手动运行验证。

### Q: 步骤执行失败如何恢复？
A: 检查error字段，修复问题后可以重新执行该步骤（需要实现retry功能）。

---

## 📞 联系支持

如果在实现过程中遇到问题，请：
1. 检查测试用例是否通过
2. 查看服务器日志
3. 验证FFmpeg是否正常工作
4. 检查文件权限和路径

---

**预计实现时间**: 2-3小时
**难度**: ⭐⭐⭐ (中等)
**优先级**: 🔴 高（核心功能）

---

*最后更新: 2026-02-09*
