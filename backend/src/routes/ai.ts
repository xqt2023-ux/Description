import { Router, Request, Response } from 'express';
import {
  chatWithAI,
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
  AIMessage,
  EditTask,
} from '../services/openai';
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
import { getMediaById } from './media';

const router = Router();

// Chat with AI (OpenAI GPT-4)
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    const response = await chatWithAI(messages as AIMessage[], systemPrompt);

    res.json({
      success: true,
      data: {
        response,
      },
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get AI response',
    });
  }
});

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
        result = await generateChapters(transcript);
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
    const { userRequest, mediaId, mediaInfo, autoExecute } = req.body;

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
      mediaInfo as MediaInfo,
      autoExecute || false,
      filePath  // Pass actual file path
    );

    res.json({
      success: true,
      data: {
        parsedRequest: result.parsedRequest,
        plan: result.plan,
        executionResult: result.executionResult,
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

    if (plan.status === 'executing') {
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

    const executionResult = await executeEditPlan(plan);

    res.json({
      success: executionResult.success,
      data: {
        outputPath: executionResult.outputPath,
        executedSteps: executionResult.executedSteps,
        totalSteps: executionResult.totalSteps,
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
        error: result.error,
      });
    }

    const history = getEditHistory(mediaId);

    res.json({
      success: true,
      data: {
        restoredState: result.restoredState,
        remainingUndoSteps: result.remainingUndoSteps,
        canRedo: history.canRedo,
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
        error: result.error,
      });
    }

    const history = getEditHistory(mediaId);

    res.json({
      success: true,
      data: {
        restoredState: result.restoredState,
        remainingRedoSteps: result.remainingRedoSteps,
        canUndo: history.canUndo,
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

    const result = clearEditHistory(mediaId);

    res.json({
      success: true,
      data: {
        clearedCount: result.clearedCount,
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

export { router as aiRoutes };
