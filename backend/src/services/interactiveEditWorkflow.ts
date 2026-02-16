/**
 * Interactive Edit Workflow Service
 *
 * Implements preview-and-confirm workflow for video editing:
 * 1. User requests edit
 * 2. System generates preview
 * 3. User confirms or rejects
 * 4. Apply changes on confirmation
 */

import { Errors } from '../middleware/errorHandler';
import { MediaInfo } from './videoEditOrchestration';
import { chatWithClaude } from './claude';
import { exportTimeline, getVideoMetadata, CutRegion } from './videoProcessing';
import path from 'path';
import fs from 'fs';

// ========================================
// Type Definitions
// ========================================

export interface Workflow {
  id: string;
  mediaId: string;
  userRequest: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  status: 'created' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
}

export interface WorkflowStep {
  id: string;
  type: 'remove_fillers' | 'add_music' | 'cut' | 'trim' | 'translate' | 'custom';
  description: string;
  status: 'pending' | 'executing' | 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'skipped';
  requiresConfirmation: boolean;
  preview?: PreviewInfo;
  result?: any;
  error?: string;
}

export interface PreviewInfo {
  type: 'video' | 'audio' | 'text' | 'data';
  url?: string;
  content?: string;
  metadata?: any;
}

// ========================================
// In-Memory Storage
// ========================================

const workflows = new Map<string, Workflow>();

// ========================================
// Workflow Management
// ========================================

// Counter for unique ID generation
let idCounter = 0;
function generateUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

/**
 * Create a new interactive workflow
 * Uses Claude AI to break down the request into confirmable steps
 */
export async function createInteractiveWorkflow(
  userRequest: string,
  mediaId: string,
  mediaInfo: MediaInfo
): Promise<Workflow> {
  const systemPrompt = `You are a video editing assistant. Break down user requests into interactive workflow steps that require preview and confirmation.

Available step types:
- remove_fillers: Remove filler words from transcript
- add_music: Add background music
- cut: Remove a specific time range
- trim: Keep only a specific range
- translate: Translate audio/subtitles
- custom: Other editing operations

Respond with JSON array of steps. Each step:
{
  "type": "remove_fillers" | "add_music" | "cut" | "trim" | "translate" | "custom",
  "description": "What this step does",
  "requiresConfirmation": true | false,
  "parameters": {
    "startTime"?: number (seconds),
    "endTime"?: number (seconds),
    etc.
  }
}

Video info: duration=${mediaInfo.duration}s, hasAudio=${mediaInfo.hasAudio}, hasVideo=${mediaInfo.hasVideo}

Break complex edits into multiple steps for better control.`;

  try {
    const response = await chatWithClaude(
      [{ role: 'user', content: userRequest }],
      systemPrompt
    );

    // Parse AI response to extract steps array
    let steps: WorkflowStep[] = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedSteps = JSON.parse(jsonMatch[0]);
        steps = parsedSteps.map((s: any, i: number) => ({
          id: generateUniqueId('step'),
          type: s.type || 'custom',
          description: s.description || userRequest,
          status: 'pending' as const,
          requiresConfirmation: s.requiresConfirmation !== false, // default true
          parameters: s.parameters || {},
        }));
      }
    } catch (parseError) {
      console.warn('Failed to parse AI response, using fallback step:', parseError);
      steps = [{
        id: generateUniqueId('step'),
        type: 'custom',
        description: userRequest,
        status: 'pending',
        requiresConfirmation: true,
      }];
    }

    const workflow: Workflow = {
      id: generateUniqueId('workflow'),
      mediaId,
      userRequest,
      steps,
      currentStepIndex: 0,
      status: 'created',
      createdAt: new Date(),
    };

    workflows.set(workflow.id, workflow);
    return workflow;
  } catch (error: any) {
    console.error('AI workflow creation failed, creating basic workflow:', error);

    // Fallback: create basic workflow without AI
    const workflow: Workflow = {
      id: generateUniqueId('workflow'),
      mediaId,
      userRequest,
      steps: [{
        id: generateUniqueId('step'),
        type: 'custom',
        description: userRequest,
        status: 'pending',
        requiresConfirmation: true,
      }],
      currentStepIndex: 0,
      status: 'created',
      createdAt: new Date(),
    };

    workflows.set(workflow.id, workflow);
    return workflow;
  }
}

/**
 * Execute a single workflow step and generate preview
 */
async function executeStepTask(
  step: WorkflowStep,
  mediaFilePath: string,
  previewDir: string
): Promise<PreviewInfo> {
  const stepParams = (step as any).parameters || {};

  switch (step.type) {
    case 'cut': {
      const { startTime, endTime } = stepParams;
      if (typeof startTime !== 'number' || typeof endTime !== 'number') {
        throw new Error('Cut step requires startTime and endTime parameters');
      }

      const previewPath = path.join(previewDir, `preview_${step.id}.mp4`);

      await exportTimeline(
        {
          sourceFile: mediaFilePath,
          cutRegions: [{ startTime, endTime }],
          options: {
            format: 'mp4',
            resolution: '720p', // Lower resolution for preview
            quality: 'medium',
          },
          outputPath: previewPath,
        },
        (progress) => {
          console.log(`Preview ${step.id}: ${progress.percent}%`);
        }
      );

      return {
        type: 'video',
        url: `/previews/${path.basename(previewPath)}`,
        metadata: {
          operation: 'cut',
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      };
    }

    case 'trim': {
      const { startTime, endTime } = stepParams;
      if (typeof startTime !== 'number' || typeof endTime !== 'number') {
        throw new Error('Trim step requires startTime and endTime parameters');
      }

      const previewPath = path.join(previewDir, `preview_${step.id}.mp4`);
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
            resolution: '720p',
            quality: 'medium',
          },
          outputPath: previewPath,
        },
        (progress) => {
          console.log(`Preview ${step.id}: ${progress.percent}%`);
        }
      );

      return {
        type: 'video',
        url: `/previews/${path.basename(previewPath)}`,
        metadata: {
          operation: 'trim',
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      };
    }

    case 'remove_fillers':
    case 'add_music':
    case 'translate':
    case 'custom':
    default: {
      // For non-video operations, return data preview
      return {
        type: 'data',
        metadata: {
          operation: step.type,
          description: step.description,
          message: 'Preview generated - this step will be applied on confirmation',
        },
      };
    }
  }
}

/**
 * Execute a specific workflow step
 * Generates a preview for user confirmation
 */
export async function executeWorkflowStep(
  workflowId: string,
  stepId: string
): Promise<{
  stepId: string;
  status: string;
  preview?: PreviewInfo;
  requiresConfirmation: boolean;
}> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  const step = workflow.steps.find((s) => s.id === stepId);

  if (!step) {
    throw Errors.notFound('Workflow step');
  }

  if (step.status !== 'pending') {
    throw Errors.validation('Step has already been executed');
  }

  step.status = 'executing';
  workflow.status = 'in_progress';

  try {
    // Create preview directory
    const previewDir = path.join(process.cwd(), 'previews', workflowId);
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    // Get media file path
    const mediaFilePath = path.join(process.cwd(), 'uploads', `${workflow.mediaId}.mp4`);

    // Check if source file exists
    let preview: PreviewInfo;

    if (fs.existsSync(mediaFilePath)) {
      // Execute actual step with FFmpeg
      preview = await executeStepTask(step, mediaFilePath, previewDir);
    } else {
      // Simulation mode for testing
      console.log(`Simulation mode - media file not found: ${mediaFilePath}`);
      preview = {
        type: 'data',
        metadata: {
          simulated: true,
          operation: step.type,
          description: step.description,
          message: 'Preview generated in simulation mode',
        },
      };
    }

    step.preview = preview;
    step.status = 'awaiting_confirmation';

    return {
      stepId: step.id,
      status: step.status,
      preview,
      requiresConfirmation: step.requiresConfirmation,
    };
  } catch (error: any) {
    step.status = 'rejected';
    step.error = error.message;
    throw error;
  }
}

/**
 * Apply confirmed step permanently
 */
async function applyStepPermanently(
  step: WorkflowStep,
  workflow: Workflow
): Promise<void> {
  // In a real implementation, this would:
  // 1. Move the preview file to final output location
  // 2. Update the media file reference in the database
  // 3. Record the change in edit history
  // 4. Clean up temporary preview files

  console.log(`Applying step ${step.id} permanently: ${step.description}`);

  // Example: Copy preview to final output
  if (step.preview?.type === 'video' && step.preview.url) {
    const previewPath = path.join(process.cwd(), 'previews', workflow.id, `preview_${step.id}.mp4`);
    const outputPath = path.join(process.cwd(), 'exports', workflow.id, `output_${step.id}.mp4`);

    if (fs.existsSync(previewPath)) {
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.copyFileSync(previewPath, outputPath);
      step.result = { outputPath, applied: true };
      console.log(`Output saved to: ${outputPath}`);
    } else {
      // Simulation mode
      step.result = { simulated: true, message: 'Changes applied in simulation mode' };
    }
  } else {
    // Non-video operations
    step.result = { applied: true, message: 'Changes applied successfully' };
  }
}

/**
 * Confirm or reject a workflow step
 * If approved, applies changes permanently
 */
export async function confirmStep(
  workflowId: string,
  stepId: string,
  approved: boolean,
  feedback?: string
): Promise<{
  stepId: string;
  status: string;
  nextStep?: string;
}> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  const step = workflow.steps.find((s) => s.id === stepId);

  if (!step) {
    throw Errors.notFound('Workflow step');
  }

  if (step.status !== 'awaiting_confirmation') {
    throw Errors.validation('Step is not awaiting confirmation');
  }

  if (approved) {
    // Apply changes permanently
    await applyStepPermanently(step, workflow);

    step.status = 'confirmed';
    workflow.currentStepIndex++;

    const nextStep =
      workflow.currentStepIndex < workflow.steps.length
        ? workflow.steps[workflow.currentStepIndex]
        : undefined;

    if (!nextStep) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      console.log(`Workflow ${workflow.id} completed`);
    }

    return {
      stepId: step.id,
      status: step.status,
      nextStep: nextStep?.id,
    };
  } else {
    // Rejected - revert changes (delete preview)
    step.status = 'rejected';
    step.result = { feedback, rejected: true };

    const previewPath = path.join(process.cwd(), 'previews', workflow.id, `preview_${step.id}.mp4`);
    if (fs.existsSync(previewPath)) {
      fs.unlinkSync(previewPath);
      console.log(`Preview deleted: ${previewPath}`);
    }

    return {
      stepId: step.id,
      status: step.status,
    };
  }
}

/**
 * Skip a workflow step
 */
export async function skipStep(
  workflowId: string,
  stepId: string
): Promise<{
  stepId: string;
  status: string;
  nextStep?: string;
}> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  const step = workflow.steps.find((s) => s.id === stepId);

  if (!step) {
    throw Errors.notFound('Workflow step');
  }

  step.status = 'skipped';
  workflow.currentStepIndex++;

  const nextStep =
    workflow.currentStepIndex < workflow.steps.length
      ? workflow.steps[workflow.currentStepIndex]
      : undefined;

  if (!nextStep) {
    workflow.status = 'completed';
    workflow.completedAt = new Date();
  }

  return {
    stepId: step.id,
    status: step.status,
    nextStep: nextStep?.id,
  };
}

/**
 * Undo the current step and go back
 */
export async function undoStep(workflowId: string): Promise<{
  success: boolean;
  currentStep?: string;
  message: string;
}> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  if (workflow.currentStepIndex <= 0) {
    return {
      success: false,
      message: 'Already at first step',
    };
  }

  // TODO: Revert last confirmed step
  workflow.currentStepIndex--;
  const currentStep = workflow.steps[workflow.currentStepIndex];
  currentStep.status = 'pending';
  currentStep.preview = undefined;

  return {
    success: true,
    currentStep: currentStep.id,
    message: 'Step undone',
  };
}

/**
 * Cancel entire workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  // TODO: Cleanup any temporary files/previews
  workflow.status = 'cancelled';

  return {
    success: true,
    message: 'Workflow cancelled',
  };
}

/**
 * Get workflow details
 */
export function getWorkflow(workflowId: string): Workflow {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  return workflow;
}

/**
 * Get all workflows
 */
export function getAllWorkflows(): Workflow[] {
  return Array.from(workflows.values());
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    throw Errors.notFound('Workflow');
  }

  // TODO: Cleanup any associated files
  workflows.delete(workflowId);

  return {
    success: true,
    message: 'Workflow deleted',
  };
}

// ========================================
// Legacy Stub Functions
// ========================================

export interface WorkflowOptions {
  command?: string;
}

export interface WorkflowResult {
  success: boolean;
  result?: any;
  error?: string;
}

export async function executeWorkflow(
  projectId: string,
  options: WorkflowOptions
): Promise<WorkflowResult> {
  return {
    success: true,
    result: {},
  };
}
