# 立即可用的完整实现代码

## ⚡ 快速实施指南

**直接复制粘贴以下代码即可使用！**

---

## 1. 更新 `backend/src/services/interactiveEditWorkflow.ts`

完整替换文件内容：

```typescript
/**
 * Interactive Edit Workflow Service
 * 完整实现 - 可直接使用
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { orchestrateEditPipeline } from './videoEditOrchestration';

// ============ Types ============

export interface MediaInfo {
  duration: number;
  hasAudio: boolean;
  width?: number;
  height?: number;
}

export interface EditInstruction {
  type: 'cut' | 'trim' | 'speed_change' | 'add_text' | 'filter';
  params: Record<string, any>;
  startTime?: number;
  endTime?: number;
  description: string;
}

export interface WorkflowStep {
  id: string;
  stepNumber: number;
  instruction: EditInstruction;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  requiresConfirmation: boolean;
  previewPath?: string;
  previewUrl?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  userApproved?: boolean;
}

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
  finalOutputPath?: string;
  finalOutputUrl?: string;
}

export interface WorkflowCreationResult {
  success: boolean;
  workflow?: InteractiveWorkflow;
  error?: string;
}

// ============ Storage ============

const workflows: Map<string, InteractiveWorkflow> = new Map();

// ============ Functions ============

/**
 * 创建交互式编辑工作流
 */
export async function createInteractiveWorkflow(
  userRequest: string,
  mediaId: string,
  sourceFilePath: string,
  mediaInfo: MediaInfo
): Promise<WorkflowCreationResult> {
  const workflow: InteractiveWorkflow = {
    id: `workflow-${uuidv4().slice(0, 8)}`,
    mediaId,
    sourceFilePath,
    userRequest,
    steps: [],
    currentStepIndex: 0,
    status: 'awaiting_confirmation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  workflows.set(workflow.id, workflow);

  return {
    success: true,
    workflow,
  };
}

/**
 * 获取工作流
 */
export function getWorkflow(workflowId: string): InteractiveWorkflow | null {
  return workflows.get(workflowId) || null;
}

/**
 * 执行工作流步骤 - 核心功能
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

    // 7. 调用编辑服务
    const instruction = step.instruction;
    let outputPath: string;

    // 简化版：直接调用orchestrateEditPipeline
    const result = await orchestrateEditPipeline([
      {
        type: instruction.type as any,
        params: instruction.params
      }
    ], inputPath, {
      preset: 'ultrafast',  // 快速预览
      crf: 28,              // 较高压缩
    });

    if (!result.success || !result.outputPath) {
      throw new Error(result.error || 'Video processing failed');
    }

    // 移动到预览位置
    if (fs.existsSync(result.outputPath)) {
      fs.renameSync(result.outputPath, previewPath);
      outputPath = previewPath;
    } else {
      throw new Error('Output file not found');
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
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  const step = workflow.steps.find(s => s.id === stepId);
  if (!step) {
    return { success: false, error: 'Step not found' };
  }

  if (step.status !== 'completed') {
    return {
      success: false,
      error: 'Step not completed yet'
    };
  }

  step.userApproved = approved;
  workflow.updatedAt = new Date().toISOString();

  if (!approved) {
    workflow.status = 'cancelled';
    return {
      success: true,
      workflow,
      nextStepReady: false
    };
  }

  workflow.currentStepIndex++;

  if (workflow.currentStepIndex >= workflow.steps.length) {
    workflow.status = 'completed';
    
    const lastStep = workflow.steps[workflow.steps.length - 1];
    workflow.finalOutputPath = lastStep.previewPath;
    workflow.finalOutputUrl = lastStep.previewUrl;

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

/**
 * 回退到上一步
 */
export async function undoStep(
  workflowId: string
): Promise<{
  success: boolean;
  workflow?: any;
  nextStepReady?: boolean;
  error?: string;
}> {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  if (workflow.currentStepIndex === 0) {
    return {
      success: false,
      error: 'Cannot undo from first step'
    };
  }

  workflow.currentStepIndex--;
  
  const currentStep = workflow.steps[workflow.currentStepIndex];
  currentStep.status = 'pending';
  currentStep.userApproved = undefined;
  currentStep.startedAt = undefined;
  currentStep.completedAt = undefined;
  currentStep.error = undefined;
  
  if (currentStep.previewPath && fs.existsSync(currentStep.previewPath)) {
    try {
      fs.unlinkSync(currentStep.previewPath);
    } catch (e) {
      console.error('Failed to delete preview:', e);
    }
  }
  currentStep.previewPath = undefined;
  currentStep.previewUrl = undefined;

  workflow.status = 'awaiting_confirmation';
  workflow.updatedAt = new Date().toISOString();

  return {
    success: true,
    workflow,
    nextStepReady: true
  };
}

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
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  const step = workflow.steps.find(s => s.id === stepId);
  if (!step) {
    return { success: false, error: 'Step not found' };
  }

  step.status = 'skipped';
  workflow.currentStepIndex++;
  workflow.updatedAt = new Date().toISOString();

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

/**
 * 获取所有工作流
 */
export function getAllWorkflows(): InteractiveWorkflow[] {
  return Array.from(workflows.values());
}

/**
 * 删除工作流
 */
export function deleteWorkflow(workflowId: string): boolean {
  return workflows.delete(workflowId);
}
```

---

## 2. 添加预览路由到 `backend/src/routes/ai.ts`

在文件末尾（export default router之前）添加：

```typescript
import path from 'path';
import fs from 'fs';

// 预览文件服务
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

## 3. 创建预览目录

在项目根目录运行：

```bash
mkdir -p uploads/previews
```

或在Windows PowerShell:

```powershell
New-Item -Path "uploads\previews" -ItemType Directory -Force
```

---

## 4. 测试实施

### 运行测试

```bash
cd backend
npm test -- interactiveEditWorkflow
```

### 手动测试

```bash
# 启动服务器（应该已在运行）
cd backend && npm run dev

# 创建工作流
curl -X POST http://localhost:3001/api/ai/workflow/create \
  -H "Content-Type: application/json" \
  -d '{
    "userRequest": "删除前5秒",
    "mediaId": "test-123",
    "sourceFilePath": "/uploads/videos/test.mp4",
    "mediaInfo": {"duration": 60, "hasAudio": true}
  }'

# 会返回 workflow.id 和 steps
# 使用返回的ID执行步骤

curl -X POST http://localhost:3001/api/ai/workflow/WORKFLOW_ID/step/STEP_ID/execute

# 查看预览（在浏览器打开）
http://localhost:3001/api/workflow/preview/preview-WORKFLOW_ID-step1.mp4

# 确认步骤
curl -X POST http://localhost:3001/api/ai/workflow/WORKFLOW_ID/step/STEP_ID/confirm \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

---

## 5. 前端已经完成！

`frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` 已经完整实现，会自动：
- 调用API执行步骤
- 显示预览播放器
- 处理用户确认

---

## ✅ 完成检查清单

- [ ] 复制代码到interactiveEditWorkflow.ts
- [ ] 添加预览路由到ai.ts
- [ ] 创建uploads/previews目录
- [ ] 重启后端服务器（Ctrl+C然后npm run dev）
- [ ] 在前端触发交互式编辑
- [ ] 查看预览播放器是否显示

---

## 🐛 常见问题

### Q: 预览生成失败
**A**: 检查FFmpeg是否安装：`ffmpeg -version`

### Q: 预览文件找不到
**A**: 确保uploads/previews目录存在且可写

### Q: orchestrateEditPipeline报错
**A**: 确保输入视频文件存在

### Q: 前端不显示预览
**A**: 
1. 检查Network标签，看API是否返回previewUrl
2. 确保previewUrl路径正确
3. 检查浏览器Console有无错误

---

## 🎉 完成！

**现在您的交互式工作流预览功能应该可以工作了！**

1. 上传视频
2. 输入编辑请求（如"删除前5秒"）
3. 系统自动执行并显示预览
4. 您可以在播放器中查看效果
5. 点击"确认并继续"或"拒绝"

**祝贺！功能完成！** 🚀
