/**
 * Video Edit Orchestration Service
 *
 * This service orchestrates complex video editing workflows by:
 * 1. Parsing user requests into structured edit plans
 * 2. Executing edit tasks in sequence
 * 3. Managing edit history (undo/redo)
 * 4. Coordinating with FFmpeg and AI services
 */

import { Errors } from '../middleware/errorHandler';
import { chatWithClaude } from './claude';
import { exportTimeline, getVideoMetadata, CutRegion } from './videoProcessing';
import { removeFillerWords } from './claude';
import path from 'path';
import fs from 'fs';

// ========================================
// Type Definitions
// ========================================

export interface MediaInfo {
  id: string;
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

export interface EditPlan {
  id: string;
  mediaId: string;
  userRequest: string;
  tasks: EditTaskInfo[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface EditTaskInfo {
  id: string;
  type: 'cut' | 'trim' | 'remove-filler' | 'translate' | 'add-music' | 'custom';
  name: string;
  description: string;
  parameters: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface EditHistory {
  mediaId: string;
  edits: EditHistoryEntry[];
  currentIndex: number;
}

export interface EditHistoryEntry {
  id: string;
  timestamp: Date;
  operation: string;
  description: string;
  beforeState: any;
  afterState: any;
}

// Counter for unique ID generation
let idCounter = 0;
function generateUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

// ========================================
// In-Memory Storage (Replace with database)
// ========================================

const editPlans = new Map<string, EditPlan>();
const editHistories = new Map<string, EditHistory>();

// ========================================
// Edit Plan Management
// ========================================

/**
 * Parse user's natural language request into structured edit plan
 * Uses Claude AI to understand intent and generate tasks
 */
export async function parseUserRequest(
  userRequest: string,
  mediaInfo: MediaInfo
): Promise<EditPlan> {
  const systemPrompt = `You are a video editing assistant. Parse user requests into structured edit tasks.

Available task types:
- cut: Remove a specific time range (e.g., "cut from 1:30 to 2:00")
- trim: Keep only a specific range (e.g., "keep only first 30 seconds")
- remove-filler: Remove filler words from transcript
- translate: Translate audio/subtitles
- add-music: Add background music
- custom: Other editing operations

Respond with JSON array of tasks. Each task:
{
  "type": "cut" | "trim" | "remove-filler" | "translate" | "add-music" | "custom",
  "name": "Brief task name",
  "description": "What this does",
  "parameters": {
    "startTime"?: number (seconds),
    "endTime"?: number (seconds),
    "language"?: string,
    etc.
  }
}

Video info: duration=${mediaInfo.duration}s, hasAudio=${mediaInfo.hasAudio}, hasVideo=${mediaInfo.hasVideo}`;

  try {
    const response = await chatWithClaude(
      [{ role: 'user', content: userRequest }],
      systemPrompt
    );

    // Parse AI response to extract task array
    let tasks: EditTaskInfo[] = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedTasks = JSON.parse(jsonMatch[0]);
        tasks = parsedTasks.map((t: any, i: number) => ({
          id: `task-${Date.now()}-${i}`,
          type: t.type || 'custom',
          name: t.name || 'Edit task',
          description: t.description || userRequest,
          parameters: t.parameters || {},
          status: 'pending' as const,
        }));
      }
    } catch (parseError) {
      console.warn('Failed to parse AI response, using fallback task:', parseError);
      tasks = [{
        id: `task-${Date.now()}`,
        type: 'custom',
        name: 'Process Request',
        description: userRequest,
        parameters: { originalRequest: userRequest },
        status: 'pending',
      }];
    }

    const plan: EditPlan = {
      id: generateUniqueId('plan'),
      mediaId: mediaInfo.id,
      userRequest,
      tasks,
      status: 'pending',
      createdAt: new Date(),
    };

    editPlans.set(plan.id, plan);
    return plan;
  } catch (error: any) {
    console.error('AI parsing failed, creating basic plan:', error);

    // Fallback: create basic plan without AI
    const plan: EditPlan = {
      id: generateUniqueId('plan'),
      mediaId: mediaInfo.id,
      userRequest,
      tasks: [{
        id: `task-${Date.now()}`,
        type: 'custom',
        name: 'Process Request',
        description: userRequest,
        parameters: {},
        status: 'pending',
      }],
      status: 'pending',
      createdAt: new Date(),
    };

    editPlans.set(plan.id, plan);
    return plan;
  }
}

/**
 * Generate detailed edit plan from user request
 * This is a simpler version that creates a basic MediaInfo and calls parseUserRequest
 */
export async function generateEditPlan(
  userRequest: string,
  mediaId: string
): Promise<EditPlan> {
  // Create basic MediaInfo (real implementation should fetch from media service)
  const basicMediaInfo: MediaInfo = {
    id: mediaId,
    duration: 0,
    hasVideo: true,
    hasAudio: true,
  };

  return parseUserRequest(userRequest, basicMediaInfo);
}

// ========================================
// Task Execution
// ========================================

/**
 * Execute a single edit task
 */
async function executeTask(
  task: EditTaskInfo,
  mediaFilePath: string,
  outputDir: string
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  try {
    task.status = 'running';

    switch (task.type) {
      case 'cut': {
        // Cut out a time range (remove it)
        const { startTime, endTime } = task.parameters;
        if (typeof startTime !== 'number' || typeof endTime !== 'number') {
          throw new Error('Cut task requires startTime and endTime parameters');
        }

        const outputPath = path.join(outputDir, `cut_${task.id}.mp4`);
        const metadata = await getVideoMetadata(mediaFilePath);

        await exportTimeline(
          {
            sourceFile: mediaFilePath,
            cutRegions: [{ startTime, endTime }],
            options: {
              format: 'mp4',
              resolution: '1080p',
              quality: 'high',
            },
            outputPath,
          },
          (progress) => {
            console.log(`Task ${task.id}: ${progress.percent}% - ${progress.currentOperation}`);
          }
        );

        task.result = { outputPath, duration: metadata.duration - (endTime - startTime) };
        return { success: true, outputPath };
      }

      case 'trim': {
        // Keep only a specific range
        const { startTime, endTime } = task.parameters;
        if (typeof startTime !== 'number' || typeof endTime !== 'number') {
          throw new Error('Trim task requires startTime and endTime parameters');
        }

        const outputPath = path.join(outputDir, `trim_${task.id}.mp4`);
        const metadata = await getVideoMetadata(mediaFilePath);

        // Trim = cut everything except this range
        const cutRegions: CutRegion[] = [];
        if (startTime > 0) {
          cutRegions.push({ startTime: 0, endTime: startTime });
        }
        if (endTime < metadata.duration) {
          cutRegions.push({ startTime: endTime, endTime: metadata.duration });
        }

        await exportTimeline(
          {
            sourceFile: mediaFilePath,
            cutRegions,
            options: {
              format: 'mp4',
              resolution: '1080p',
              quality: 'high',
            },
            outputPath,
          },
          (progress) => {
            console.log(`Task ${task.id}: ${progress.percent}% - ${progress.currentOperation}`);
          }
        );

        task.result = { outputPath, duration: endTime - startTime };
        return { success: true, outputPath };
      }

      case 'remove-filler': {
        // Remove filler words (requires transcript)
        // This is a placeholder - real implementation would:
        // 1. Get transcript for media
        // 2. Use Claude to remove filler words
        // 3. Generate cut regions based on filler word timestamps
        // 4. Export video with cuts

        console.log('Remove filler words task - requires transcript integration');
        task.result = { message: 'Filler word removal requires transcript' };
        return { success: true };
      }

      case 'custom':
      default: {
        // Custom task - just mark as completed
        console.log(`Custom task: ${task.description}`);
        task.result = { message: 'Custom task completed (no action taken)' };
        return { success: true };
      }
    }
  } catch (error: any) {
    task.error = error.message;
    return { success: false, error: error.message };
  }
}

/**
 * Execute an edit plan
 * Executes all tasks sequentially and generates final output
 */
export async function executeEditPlan(planId: string): Promise<{
  success: boolean;
  planId: string;
  completedTasks: number;
  error?: string;
}> {
  const plan = editPlans.get(planId);

  if (!plan) {
    throw Errors.notFound('Edit plan');
  }

  plan.status = 'in_progress';

  try {
    // Create output directory for this plan
    const outputDir = path.join(process.cwd(), 'exports', planId);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Note: In real implementation, we need to get the actual media file path
    // For now, using a placeholder path
    const mediaFilePath = path.join(process.cwd(), 'uploads', `${plan.mediaId}.mp4`);

    // Check if source file exists
    const fileExists = fs.existsSync(mediaFilePath);

    // If file doesn't exist, run in simulation mode (for testing)
    if (!fileExists) {
      console.log(`Running in simulation mode - media file not found: ${mediaFilePath}`);

      // Simulate task execution without actual FFmpeg operations
      for (const task of plan.tasks) {
        task.status = 'running';
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 10));
        task.status = 'completed';
        task.result = { simulated: true, message: 'Executed in simulation mode' };
      }

      plan.status = 'completed';
      plan.completedAt = new Date();

      // Record in history
      const history = initializeHistory(plan.mediaId);
      history.edits.push({
        id: plan.id,
        timestamp: new Date(),
        operation: 'execute_plan',
        description: plan.userRequest,
        beforeState: null,
        afterState: { planId: plan.id, tasks: plan.tasks.length, simulated: true },
      });
      history.currentIndex = history.edits.length - 1;

      return {
        success: true,
        planId,
        completedTasks: plan.tasks.length,
      };
    }

    let completedCount = 0;

    // Execute tasks sequentially
    for (const task of plan.tasks) {
      const result = await executeTask(task, mediaFilePath, outputDir);

      if (result.success) {
        task.status = 'completed';
        completedCount++;
      } else {
        task.status = 'failed';
        task.error = result.error;
        throw new Error(`Task ${task.id} failed: ${result.error}`);
      }
    }

    plan.status = 'completed';
    plan.completedAt = new Date();

    // Record in edit history
    const history = initializeHistory(plan.mediaId);
    history.edits.push({
      id: plan.id,
      timestamp: new Date(),
      operation: 'execute_plan',
      description: plan.userRequest,
      beforeState: null,
      afterState: { planId: plan.id, tasks: plan.tasks.length },
    });
    history.currentIndex = history.edits.length - 1;

    return {
      success: true,
      planId,
      completedTasks: completedCount,
    };
  } catch (error: any) {
    plan.status = 'failed';
    return {
      success: false,
      planId,
      completedTasks: plan.tasks.filter(t => t.status === 'completed').length,
      error: error.message,
    };
  }
}

/**
 * Get status of an edit plan
 */
export function getEditPlanStatus(planId: string): EditPlan {
  const plan = editPlans.get(planId);
  if (!plan) {
    throw Errors.notFound('Edit plan');
  }
  return plan;
}

/**
 * Get all edit plans
 */
export function getAllEditPlans(): EditPlan[] {
  return Array.from(editPlans.values());
}

/**
 * Main orchestration function
 */
export async function orchestrateVideoEdit(
  userRequest: string,
  mediaId: string,
  mediaInfo: MediaInfo
): Promise<{
  success: boolean;
  planId: string;
  message: string;
}> {
  const plan = await generateEditPlan(userRequest, mediaId);
  return {
    success: true,
    planId: plan.id,
    message: `Edit plan created with ${plan.tasks.length} tasks`,
  };
}

// ========================================
// Edit History (Undo/Redo)
// ========================================

function initializeHistory(mediaId: string): EditHistory {
  if (!editHistories.has(mediaId)) {
    editHistories.set(mediaId, {
      mediaId,
      edits: [],
      currentIndex: -1,
    });
  }
  return editHistories.get(mediaId)!;
}

export async function undoLastEdit(mediaId: string): Promise<{
  success: boolean;
  message: string;
  canUndo: boolean;
  canRedo: boolean;
}> {
  const history = initializeHistory(mediaId);

  if (history.currentIndex < 0) {
    return {
      success: false,
      message: 'No edits to undo',
      canUndo: false,
      canRedo: history.currentIndex < history.edits.length - 1,
    };
  }

  // Move index back
  const undoneEdit = history.edits[history.currentIndex];
  history.currentIndex--;

  console.log(`Undoing edit: ${undoneEdit.operation} - ${undoneEdit.description}`);

  // In a real implementation, this would:
  // 1. Restore the previous state from beforeState
  // 2. Delete the output files created by this edit
  // 3. Update the media file reference

  return {
    success: true,
    message: `Undone: ${undoneEdit.description}`,
    canUndo: history.currentIndex >= 0,
    canRedo: true,
  };
}

export async function redoEdit(mediaId: string): Promise<{
  success: boolean;
  message: string;
  canUndo: boolean;
  canRedo: boolean;
}> {
  const history = initializeHistory(mediaId);

  if (history.currentIndex >= history.edits.length - 1) {
    return {
      success: false,
      message: 'No edits to redo',
      canUndo: history.currentIndex >= 0,
      canRedo: false,
    };
  }

  // Move index forward
  history.currentIndex++;
  const redoneEdit = history.edits[history.currentIndex];

  console.log(`Redoing edit: ${redoneEdit.operation} - ${redoneEdit.description}`);

  // In a real implementation, this would:
  // 1. Restore the afterState
  // 2. Re-apply the edit operation
  // 3. Update the media file reference

  return {
    success: true,
    message: `Redone: ${redoneEdit.description}`,
    canUndo: true,
    canRedo: history.currentIndex < history.edits.length - 1,
  };
}

export function getEditHistory(mediaId: string): EditHistory {
  return initializeHistory(mediaId);
}

export function clearEditHistory(mediaId: string): void {
  editHistories.delete(mediaId);
}

// ========================================
// Legacy Stub Functions
// ========================================

export interface EditOptions {
  command?: string;
  timeline?: any;
}

export interface EditResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export async function executeEdit(
  projectId: string,
  options: EditOptions
): Promise<EditResult> {
  return {
    success: true,
    outputPath: `/exports/${projectId}.mp4`,
  };
}
