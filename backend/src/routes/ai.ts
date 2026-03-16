import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { Errors } from '../middleware/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import {
  chatWithClaude as chatWithAI,
  removeFillerWords,
  generateSummary,
  generateShowNotes,
  generateSocialPosts,
  suggestCuts,
  translateTranscript,
  generateChapters,
  improveTranscript,
  planEditTasks,
  executeEditTask,
  ClaudeMessage,
  EditTask,
} from '../services/claude';

// Type aliases for compatibility
export type AIMessage = ClaudeMessage;
import {
  parseUserRequest,
  generateEditPlan,
  executeEditPlan,
  getEditPlanStatus,
  getAllEditPlans,
  orchestrateVideoEdit,
  MediaInfo,
  undoLastEdit,
  redoEdit,
  getEditHistory,
  clearEditHistory,
} from '../services/videoEditOrchestration';
import {
  createInteractiveWorkflow,
  executeWorkflowStep,
  confirmStep,
  skipStep,
  undoStep,
  cancelWorkflow,
  getWorkflow,
  getAllWorkflows,
  deleteWorkflow,
} from '../services/interactiveEditWorkflow';
import { chat as underlordChat } from '../services/underlordService';
import { exportTimeline } from '../services/videoProcessing';
import { getMediaById } from './media';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Chat with AI (OpenAI GPT-4)
router.post('/chat', asyncHandler(async (req: Request, res: Response) => {
  const { messages, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    throw Errors.validation('Messages array is required');
  }

  const response = await chatWithAI(messages as AIMessage[], systemPrompt);

  res.json({
    success: true,
    data: { response },
  });
}));

// Execute a specific skill
router.post('/skills/:skillName', async (req: Request, res: Response) => {
  try {
    const { skillName } = req.params;
    const { transcript, targetLanguage, platform } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required',
      });
    }

    let result;

    switch (skillName) {
      case 'remove-filler-words':
        result = await removeFillerWords(transcript);
        break;
      case 'generate-summary':
        result = await generateSummary(transcript);
        break;
      case 'generate-show-notes':
        result = await generateShowNotes(transcript);
        break;
      case 'generate-social-posts':
        result = await generateSocialPosts(transcript, platform || 'twitter');
        break;
      case 'suggest-cuts':
        result = await suggestCuts(transcript);
        break;
      case 'translate':
        if (!targetLanguage) {
          return res.status(400).json({
            success: false,
            error: 'Target language is required for translation',
          });
        }
        result = await translateTranscript(transcript, targetLanguage);
        break;
      case 'generate-chapters':
        // Generate chapters from transcript text only (no segments available)
        result = await generateChapters(transcript, []);
        break;
      case 'improve-transcript':
        result = await improveTranscript(transcript);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown skill: ${skillName}`,
        });
    }

    res.json({
      success: result.success,
      data: result.success ? { result: result.result } : undefined,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Skill execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute skill',
    });
  }
});

// List available skills
router.get('/skills', (req: Request, res: Response) => {
  const skills = [
    {
      id: 'remove-filler-words',
      name: 'Remove Filler Words',
      description: 'Remove um, uh, like, you know and other filler words',
      icon: 'scissors',
      color: '#f59e0b',
    },
    {
      id: 'generate-summary',
      name: 'Generate Summary',
      description: 'Create a concise summary of your video content',
      icon: 'file-text',
      color: '#8b5cf6',
    },
    {
      id: 'generate-show-notes',
      name: 'Generate Show Notes',
      description: 'Create professional show notes with key points',
      icon: 'clipboard-list',
      color: '#06b6d4',
    },
    {
      id: 'generate-social-posts',
      name: 'Social Media Posts',
      description: 'Generate posts for Twitter, LinkedIn, Instagram',
      icon: 'share',
      color: '#ec4899',
    },
    {
      id: 'suggest-cuts',
      name: 'Suggest Cuts',
      description: 'Find repetitive or unnecessary content to remove',
      icon: 'scissors',
      color: '#ef4444',
    },
    {
      id: 'translate',
      name: 'Translate',
      description: 'Translate your transcript to another language',
      icon: 'globe',
      color: '#10b981',
    },
    {
      id: 'generate-chapters',
      name: 'Generate Chapters',
      description: 'Auto-generate chapter markers and timestamps',
      icon: 'list',
      color: '#f97316',
    },
    {
      id: 'improve-transcript',
      name: 'Improve Transcript',
      description: 'Fix grammar and improve readability',
      icon: 'sparkles',
      color: '#7c3aed',
    },
  ];

  res.json({
    success: true,
    data: skills,
  });
});

// Plan edit tasks from natural language request
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { request, context } = req.body;

    if (!request) {
      return res.status(400).json({
        success: false,
        error: 'Request text is required',
      });
    }

    const plan = await planEditTasks(request, context || { hasTranscript: false });

    res.json({
      success: plan.success,
      data: plan.success ? {
        userIntent: plan.userIntent,
        tasks: plan.tasks,
        summary: plan.summary,
      } : undefined,
      error: plan.error,
    });
  } catch (error: any) {
    console.error('Plan edit tasks error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to plan edit tasks',
    });
  }
});

// Execute a single edit task
router.post('/execute-task', async (req: Request, res: Response) => {
  try {
    const { task, transcript } = req.body;

    if (!task) {
      return res.status(400).json({
        success: false,
        error: 'Task is required',
      });
    }

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for task execution',
      });
    }

    const result = await executeEditTask(task as EditTask, transcript);

    res.json({
      success: result.success,
      data: result.success ? { result: result.result } : undefined,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Execute task error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute task',
    });
  }
});

// Execute multiple tasks in sequence (workflow execution)
router.post('/execute-workflow', async (req: Request, res: Response) => {
  try {
    const { tasks, transcript } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tasks array is required',
      });
    }

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for workflow execution',
      });
    }

    const results: Array<{
      taskId: string;
      success: boolean;
      result?: string;
      error?: string;
    }> = [];

    let currentTranscript = transcript;

    for (const task of tasks) {
      const result = await executeEditTask(task as EditTask, currentTranscript);
      results.push({
        taskId: task.id,
        success: result.success,
        result: result.result,
        error: result.error,
      });

      // If the task modified the transcript, use the new version for subsequent tasks
      if (result.success && result.result && 
          ['remove-filler', 'improve', 'translate'].includes(task.type)) {
        currentTranscript = result.result;
      }
    }

    const allSucceeded = results.every(r => r.success);

    res.json({
      success: allSucceeded,
      data: {
        results,
        finalTranscript: currentTranscript,
      },
      error: allSucceeded ? undefined : 'Some tasks failed',
    });
  } catch (error: any) {
    console.error('Execute workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute workflow',
    });
  }
});

// ============ Video Edit Orchestration API ============

/**
 * POST /api/ai/orchestrate
 * 提交视频编辑编排请求
 */
router.post('/orchestrate', async (req: Request, res: Response) => {
  try {
    const { userRequest, mediaId, mediaInfo } = req.body;

    if (!userRequest || typeof userRequest !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User request text is required',
      });
    }

    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID is required',
      });
    }

    if (!mediaInfo || typeof mediaInfo.duration !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Media info with duration is required',
      });
    }

    // Get actual file path from media store
    const media = getMediaById(mediaId);
    const filePath = media?.filePath || media?.filename;
    console.log('[Orchestrate] Media lookup:', { mediaId, filePath, hasMedia: !!media });

    const result = await orchestrateVideoEdit(
      userRequest,
      mediaId,
      mediaInfo as MediaInfo
    );

    res.json({
      success: true,
      data: {
        planId: result.planId,
        message: result.message,
      },
    });
  } catch (error: any) {
    console.error('Orchestrate video edit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to orchestrate video edit',
    });
  }
});

/**
 * GET /api/ai/orchestrate/:planId/status
 * 获取编辑计划状态
 */
router.get('/orchestrate/:planId/status', (req: Request, res: Response) => {
  try {
    const { planId } = req.params;

    const plan = getEditPlanStatus(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: `Edit plan not found: ${planId}`,
      });
    }

    res.json({
      success: true,
      data: { plan },
    });
  } catch (error: any) {
    console.error('Get plan status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get plan status',
    });
  }
});

/**
 * POST /api/ai/orchestrate/:planId/execute
 * 执行指定的编辑计划
 */
router.post('/orchestrate/:planId/execute', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;

    const plan = getEditPlanStatus(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: `Edit plan not found: ${planId}`,
      });
    }

    if (plan.status === 'in_progress') {
      return res.status(409).json({
        success: false,
        error: 'Plan is already being executed',
      });
    }

    if (plan.status === 'completed') {
      return res.status(409).json({
        success: false,
        error: 'Plan has already been completed',
      });
    }

    const executionResult = await executeEditPlan(plan.id);

    res.json({
      success: executionResult.success,
      data: {
        planId: executionResult.planId,
        completedTasks: executionResult.completedTasks,
      },
      error: executionResult.error,
    });
  } catch (error: any) {
    console.error('Execute plan error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute plan',
    });
  }
});

/**
 * GET /api/ai/orchestrate/plans
 * 获取所有编辑计划
 */
router.get('/orchestrate/plans', (req: Request, res: Response) => {
  try {
    const plans = getAllEditPlans();

    res.json({
      success: true,
      data: { plans },
    });
  } catch (error: any) {
    console.error('Get all plans error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get plans',
    });
  }
});

// ============ Undo/Redo API ============

/**
 * POST /api/ai/orchestrate/:mediaId/undo
 * 撤回上一步编辑操作
 */
router.post('/orchestrate/:mediaId/undo', async (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;

    const result = await undoLastEdit(mediaId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      data: {
        message: result.message,
        canUndo: result.canUndo,
        canRedo: result.canRedo,
      },
    });
  } catch (error: any) {
    console.error('Undo edit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to undo edit',
    });
  }
});

/**
 * POST /api/ai/orchestrate/:mediaId/redo
 * 重做编辑操作
 */
router.post('/orchestrate/:mediaId/redo', async (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;

    const result = await redoEdit(mediaId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      data: {
        message: result.message,
        canUndo: result.canUndo,
        canRedo: result.canRedo,
      },
    });
  } catch (error: any) {
    console.error('Redo edit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to redo edit',
    });
  }
});

/**
 * GET /api/ai/orchestrate/:mediaId/history
 * 获取媒体的编辑历史
 */
router.get('/orchestrate/:mediaId/history', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;

    const history = getEditHistory(mediaId);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get history',
    });
  }
});

/**
 * DELETE /api/ai/orchestrate/:mediaId/history
 * 清空媒体的编辑历史
 */
router.delete('/orchestrate/:mediaId/history', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;

    clearEditHistory(mediaId);

    res.json({
      success: true,
      data: {
        message: 'Edit history cleared',
      },
    });
  } catch (error: any) {
    console.error('Clear history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear history',
    });
  }
});

// ============ Interactive Workflow API ============

/**
 * POST /api/ai/workflow/create
 * 创建交互式编辑工作流
 */
router.post('/workflow/create', async (req: Request, res: Response) => {
  try {
    const { userRequest, mediaId, mediaInfo } = req.body;

    if (!userRequest) {
      return res.status(400).json({
        success: false,
        error: 'User request is required',
      });
    }

    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID is required',
      });
    }

    if (!mediaInfo) {
      return res.status(400).json({
        success: false,
        error: 'mediaInfo is required',
      });
    }

    // Verify media exists
    const media = getMediaById(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        error: `Media not found: ${mediaId}`,
      });
    }

    // Resolve the local file path so step execution can find the video
    let mediaFilePath: string | undefined;
    if (media?.filePath && fs.existsSync(media.filePath)) {
      mediaFilePath = media.filePath;
    } else if (media?.url) {
      const urlPath = (media.url as string)
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\//, '');
      const candidate = path.join(process.cwd(), urlPath);
      if (fs.existsSync(candidate)) mediaFilePath = candidate;
    }

    const workflow = await createInteractiveWorkflow(
      userRequest,
      mediaId,
      mediaInfo as MediaInfo,
      mediaFilePath
    );

    res.json({
      success: true,
      data: {
        workflowId: workflow.id,
        steps: workflow.steps,
        status: workflow.status,
        currentStepIndex: workflow.currentStepIndex,
      },
    });
  } catch (error: any) {
    console.error('Create workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create workflow',
    });
  }
});

/**
 * GET /api/ai/workflow/list
 * 获取所有工作流
 * NOTE: must be defined before /workflow/:workflowId to avoid being shadowed
 */
router.get('/workflow/list', (_req: Request, res: Response) => {
  try {
    const workflows = getAllWorkflows();
    res.json({ success: true, data: { workflows } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to list workflows' });
  }
});

/**
 * GET /api/workflow/preview/:filename
 * 服务预览视频文件
 * NOTE: must be defined before /workflow/:workflowId to avoid being shadowed
 */
router.get('/workflow/preview/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const pathMod = require('path');
    const fsMod = require('fs');
    const filePath = pathMod.join('uploads', 'previews', filename);
    if (!fsMod.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Preview not found' });
    }
    res.sendFile(pathMod.resolve(filePath));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to serve preview' });
  }
});

/**
 * GET /api/ai/workflow/:workflowId
 * 获取工作流状态
 */
router.get('/workflow/:workflowId', (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;
    const workflow = getWorkflow(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: `Workflow not found: ${workflowId}`,
      });
    }

    res.json({
      success: true,
      data: { workflow },
    });
  } catch (error: any) {
    console.error('Get workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get workflow',
    });
  }
});

/**
 * POST /api/ai/workflow/:workflowId/step/:stepId/execute
 * 执行工作流中的某个步骤
 */
router.post('/workflow/:workflowId/step/:stepId/execute', async (req: Request, res: Response) => {
  try {
    const { workflowId, stepId } = req.params;

    const result = await executeWorkflowStep(workflowId, stepId);

    // Return updated workflow
    const workflow = getWorkflow(workflowId);

    res.json({
      success: true,
      data: {
        stepId: result.stepId,
        status: result.status,
        preview: result.preview,
        requiresConfirmation: result.requiresConfirmation,
        workflow,
      },
    });
  } catch (error: any) {
    console.error('Execute step error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute step',
    });
  }
});

/**
 * POST /api/ai/workflow/:workflowId/step/:stepId/confirm
 * 用户确认步骤结果
 */
router.post('/workflow/:workflowId/step/:stepId/confirm', async (req: Request, res: Response) => {
  try {
    const { workflowId, stepId } = req.params;
    const { approved } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'approved (boolean) is required',
      });
    }

    const result = await confirmStep(workflowId, stepId, approved);
    const workflow = getWorkflow(workflowId);

    res.json({
      success: true,
      data: {
        stepId: result.stepId,
        status: result.status,
        nextStep: result.nextStep,
        workflow,
      },
    });
  } catch (error: any) {
    console.error('Confirm step error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to confirm step',
    });
  }
});

/**
 * POST /api/ai/workflow/:workflowId/step/:stepId/skip
 * 跳过当前步骤
 */
router.post('/workflow/:workflowId/step/:stepId/skip', async (req: Request, res: Response) => {
  try {
    const { workflowId, stepId } = req.params;

    const result = await skipStep(workflowId, stepId);
    const workflow = getWorkflow(workflowId);

    res.json({
      success: true,
      data: {
        stepId: result.stepId,
        status: result.status,
        nextStep: result.nextStep,
        workflow,
      },
    });
  } catch (error: any) {
    console.error('Skip step error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to skip step',
    });
  }
});

/**
 * POST /api/ai/workflow/:workflowId/undo
 * 回退到上一步
 */
router.post('/workflow/:workflowId/undo', async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;

    const result = await undoStep(workflowId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    const workflow = getWorkflow(workflowId);

    res.json({
      success: true,
      data: {
        currentStep: result.currentStep,
        message: result.message,
        workflow,
      },
    });
  } catch (error: any) {
    console.error('Undo step error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to undo step',
    });
  }
});

/**
 * POST /api/ai/workflow/:workflowId/cancel
 * 取消工作流
 */
router.post('/workflow/:workflowId/cancel', (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;

    const success = cancelWorkflow(workflowId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: `Workflow not found: ${workflowId}`,
      });
    }

    res.json({
      success: true,
      message: 'Workflow cancelled',
    });
  } catch (error: any) {
    console.error('Cancel workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel workflow',
    });
  }
});


/**
 * DELETE /api/ai/workflow/:workflowId
 * 删除工作流
 */
router.delete('/workflow/:workflowId', (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;

    const success = deleteWorkflow(workflowId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: `Workflow not found: ${workflowId}`,
      });
    }

    res.json({
      success: true,
      message: 'Workflow deleted',
    });
  } catch (error: any) {
    console.error('Delete workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete workflow',
    });
  }
});


// ============ Underlord SSE Chat API ============

/**
 * POST /api/ai/underlord
 * Streaming chat endpoint — returns Server-Sent Events
 */
router.post('/underlord', async (req: Request, res: Response) => {
  const { message, mediaId, mediaInfo, conversationHistory } = req.body;

  if (!message || !mediaId) {
    return res.status(400).json({ success: false, error: 'message and mediaId are required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Resolve media file path — prefer stored filePath, fallback to URL-derived path
  const media = getMediaById(mediaId);
  let mediaFilePath: string | undefined;
  if (media?.filePath && fs.existsSync(media.filePath)) {
    mediaFilePath = media.filePath;
  } else if (media?.url) {
    const urlPath = (media.url as string)
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\//, '');
    const candidate = path.join(process.cwd(), urlPath);
    if (fs.existsSync(candidate)) mediaFilePath = candidate;
  }

  const emit = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await underlordChat(
      { message, mediaId, mediaInfo, conversationHistory, mediaFilePath },
      emit
    );
  } catch (err: any) {
    emit({ type: 'error', message: err.message || 'Internal error' });
  }

  res.end();
});

/**
 * POST /api/ai/underlord/export
 * SSE export endpoint — applies cut regions and produces a downloadable video
 * Body: { mediaId: string, cuts: { startTime: number, endTime: number }[] }
 * SSE: { type: 'progress', percent } → { type: 'done', downloadUrl }
 */
router.post('/underlord/export', async (req: Request, res: Response) => {
  const { mediaId, cuts } = req.body;

  if (!mediaId) {
    return res.status(400).json({ success: false, error: 'mediaId is required' });
  }
  if (!Array.isArray(cuts)) {
    return res.status(400).json({ success: false, error: 'cuts must be an array' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const emit = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    // Resolve media file path
    const media = getMediaById(mediaId);
    if (!media) {
      emit({ type: 'error', message: 'Media file not found' });
      return res.end();
    }

    let mediaFilePath: string | undefined;
    if (media.filePath) {
      mediaFilePath = media.filePath;
    } else if (media.url) {
      const urlPath = (media.url as string).replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
      const candidate = path.join(process.cwd(), urlPath);
      if (fs.existsSync(candidate)) mediaFilePath = candidate;
    }

    if (!mediaFilePath || !fs.existsSync(mediaFilePath)) {
      emit({ type: 'error', message: 'Media file not found on disk' });
      return res.end();
    }

    // Prepare output file
    const jobId = uuidv4();
    const exportsDir = process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, 'exports')
      : path.join(process.cwd(), 'uploads', 'exports');
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
    const outputPath = path.join(exportsDir, `edited-${jobId}.mp4`);

    // Run FFmpeg export with progress streaming
    await exportTimeline(
      { sourceFile: mediaFilePath, cutRegions: cuts, options: { format: 'mp4', resolution: '1080p', quality: 'high' }, outputPath },
      (progress) => {
        emit({ type: 'progress', percent: progress.percent, operation: progress.currentOperation });
      }
    );

    const downloadUrl = `/api/exports/download/edited-${jobId}.mp4`;
    emit({ type: 'done', downloadUrl });
  } catch (err: any) {
    emit({ type: 'error', message: err.message || 'Export failed' });
  }

  res.end();
});

/**
 * POST /api/ai/underlord/revert/:operationId
 * Revert the last operation performed by a workflow
 */
router.post('/underlord/revert/:operationId', async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;
    const result = await undoStep(operationId);

    res.json({
      success: result.success,
      data: result.success ? { message: result.message } : undefined,
      error: result.success ? undefined : result.message,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Revert failed' });
  }
});

export { router as aiRoutes };
