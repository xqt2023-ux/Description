/**
 * Interactive Edit Workflow Service
 *
 * Implements preview-and-confirm workflow for video editing:
 * 1. User requests edit
 * 2. System generates preview
 * 3. User confirms or rejects
 * 4. Apply changes on confirmation
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import ffmpegLib from 'fluent-ffmpeg';
import { Errors } from '../middleware/errorHandler';
import { MediaInfo } from './videoEditOrchestration';
import { exportTimeline, getVideoMetadata, CutRegion } from './videoProcessing';
import { getStoredTranscript } from './dubbing';
import path from 'path';
import fs from 'fs';

/** Build an OpenAI-compatible client (Babelark proxy or direct OpenAI) */
function buildAIClient(): OpenAI | null {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  if (process.env.BABELARK_API_KEY) {
    return new OpenAI({
      apiKey: process.env.BABELARK_API_KEY,
      baseURL: 'https://api.babelark.com/v1',
      httpAgent,
    } as any);
  }

  if (process.env.OPENAI_API_KEY) {
    const config: any = { apiKey: process.env.OPENAI_API_KEY, httpAgent };
    if (process.env.OPENAI_BASE_URL) config.baseURL = process.env.OPENAI_BASE_URL;
    return new OpenAI(config);
  }

  return null;
}

// ========================================
// Type Definitions
// ========================================

export interface Workflow {
  id: string;
  mediaId: string;
  mediaFilePath?: string;   // resolved local path used during step execution
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

// ── Tool Registry ─────────────────────────────────────────────────────────────

export interface ToolContext {
  step: WorkflowStep;
  mediaFilePath: string;
  mediaId: string;
  previewDir: string;
}

export type ToolHandler = (ctx: ToolContext) => Promise<PreviewInfo>;

const toolRegistry = new Map<string, ToolHandler>();

/**
 * Register a workflow tool handler for a given step type.
 * External modules can add new step types by calling this at startup.
 */
export function registerWorkflowTool(stepType: string, handler: ToolHandler): void {
  toolRegistry.set(stepType, handler);
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
  mediaInfo: MediaInfo,
  mediaFilePath?: string
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

  const client = buildAIClient();
  if (!client) {
    console.warn('[Workflow] No AI client configured, creating basic workflow');
    const workflow: Workflow = {
      id: generateUniqueId('workflow'),
      mediaId,
      mediaFilePath,
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

  try {
    const model = process.env.BABELARK_MODEL || 'gpt-4o-mini';
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userRequest },
      ],
    });
    const response = completion.choices[0]?.message?.content || '';

    // Parse AI response to extract steps array
    let steps: WorkflowStep[] = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedSteps = JSON.parse(jsonMatch[0]);
        steps = parsedSteps.map((s: any) => ({
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
      mediaFilePath,
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
      mediaFilePath,
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

/** FFmpeg helper: replace the audio track of a video with a new audio file */
function replaceAudioTrack(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpegLib()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-map 0:v:0',   // video stream from original
        '-map 1:a:0',   // audio stream from TTS file
        '-c:v copy',    // copy video without re-encoding
        '-c:a aac',     // encode audio as AAC for MP4
        '-shortest',    // trim output to the shorter stream
      ])
      .on('start', cmd => console.log('[Workflow] FFmpeg replace-audio:', cmd))
      .on('end', () => resolve())
      .on('error', err => reject(new Error(`FFmpeg audio replace failed: ${err.message}`)))
      .save(outputPath);
  });
}

// ── Built-in Tool Handlers ────────────────────────────────────────────────────

async function handleCut(ctx: ToolContext): Promise<PreviewInfo> {
  const { step, mediaFilePath, previewDir } = ctx;
  const stepParams = (step as any).parameters || {};
  const { startTime, endTime } = stepParams;
  if (typeof startTime !== 'number' || typeof endTime !== 'number') {
    throw new Error('Cut step requires startTime and endTime parameters');
  }
  const previewPath = path.join(previewDir, `preview_${step.id}.mp4`);
  await exportTimeline(
    {
      sourceFile: mediaFilePath,
      cutRegions: [{ startTime, endTime }],
      options: { format: 'mp4', resolution: '720p', quality: 'medium' },
      outputPath: previewPath,
    },
    progress => console.log(`[Workflow] Cut preview ${step.id}: ${progress.percent}%`)
  );
  return {
    type: 'video',
    url: `/previews/${path.basename(previewDir)}/${path.basename(previewPath)}`,
    content: `Cut segment ${startTime}s – ${endTime}s (${endTime - startTime}s removed)`,
    metadata: { operation: 'cut', startTime, endTime },
  };
}

async function handleTrim(ctx: ToolContext): Promise<PreviewInfo> {
  const { step, mediaFilePath, previewDir } = ctx;
  const stepParams = (step as any).parameters || {};
  const { startTime, endTime } = stepParams;
  if (typeof startTime !== 'number' || typeof endTime !== 'number') {
    throw new Error('Trim step requires startTime and endTime parameters');
  }
  const previewPath = path.join(previewDir, `preview_${step.id}.mp4`);
  const meta = await getVideoMetadata(mediaFilePath);
  const cutRegions: CutRegion[] = [];
  if (startTime > 0) cutRegions.push({ startTime: 0, endTime: startTime });
  if (endTime < meta.duration) cutRegions.push({ startTime: endTime, endTime: meta.duration });
  await exportTimeline(
    {
      sourceFile: mediaFilePath,
      cutRegions,
      options: { format: 'mp4', resolution: '720p', quality: 'medium' },
      outputPath: previewPath,
    },
    progress => console.log(`[Workflow] Trim preview ${step.id}: ${progress.percent}%`)
  );
  return {
    type: 'video',
    url: `/previews/${path.basename(previewDir)}/${path.basename(previewPath)}`,
    content: `Trimmed to ${startTime}s – ${endTime}s (${endTime - startTime}s kept)`,
    metadata: { operation: 'trim', startTime, endTime },
  };
}

async function handleTranslate(ctx: ToolContext): Promise<PreviewInfo> {
  const { step, mediaFilePath, mediaId, previewDir } = ctx;
  const stepParams = (step as any).parameters || {};
  const stored = getStoredTranscript(mediaId);
  const sourceText = stored
    ? (stored.text || (stored.segments as any[])?.map((s: any) => s.text).join(' ') || '')
    : '';

  if (!sourceText) {
    return {
      type: 'text',
      content: '⚠️ No transcript found. Please transcribe the video first, then retry.',
    };
  }

  const client = buildAIClient();
  if (!client) {
    return { type: 'text', content: '⚠️ Translation requires BABELARK_API_KEY or OPENAI_API_KEY.' };
  }

  const targetLanguage = stepParams.targetLanguage || 'English';
  const model = process.env.BABELARK_MODEL || 'gpt-4o-mini';

  console.log(`[Workflow] Translating transcript (${sourceText.length} chars) → ${targetLanguage}`);
  const translateRes = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Translate the following text to ${targetLanguage}. Return ONLY the translated text, no explanations:\n\n${sourceText}`,
    }],
  });
  const translatedText = translateRes.choices[0]?.message?.content?.trim() || sourceText;
  console.log(`[Workflow] Translation done: ${translatedText.length} chars`);

  // TTS + audio replacement (requires OpenAI TTS and media file)
  if (process.env.OPENAI_API_KEY && mediaFilePath && fs.existsSync(mediaFilePath)) {
    try {
      console.log('[Workflow] Generating TTS audio via OpenAI...');
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, httpAgent } as any);

      const ttsInput = translatedText.slice(0, 4096); // OpenAI TTS hard limit
      const ttsRes = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: ttsInput,
      });
      const ttsPath = path.join(previewDir, `tts_${step.id}.mp3`);
      fs.writeFileSync(ttsPath, Buffer.from(await ttsRes.arrayBuffer()));
      console.log(`[Workflow] TTS saved: ${ttsPath}`);

      const outputVideoPath = path.join(previewDir, `preview_${step.id}.mp4`);
      await replaceAudioTrack(mediaFilePath, ttsPath, outputVideoPath);
      console.log(`[Workflow] Audio replaced → ${outputVideoPath}`);

      return {
        type: 'video',
        url: `/previews/${path.basename(previewDir)}/${path.basename(outputVideoPath)}`,
        content: `✅ Audio replaced with ${targetLanguage} voice.\n\nTranslation preview:\n${translatedText.slice(0, 400)}${translatedText.length > 400 ? '…' : ''}`,
        metadata: { operation: 'translate', targetLanguage, translatedText, outputVideoPath },
      };
    } catch (ttsErr: any) {
      console.warn('[Workflow] TTS/audio replacement failed, returning text only:', ttsErr.message);
    }
  }

  // Fallback: text-only translation result
  return {
    type: 'text',
    content: `Translation to ${targetLanguage}:\n\n${translatedText}`,
    metadata: { operation: 'translate', targetLanguage },
  };
}

async function handleRemoveFillers(ctx: ToolContext): Promise<PreviewInfo> {
  const { mediaId } = ctx;
  const stored = getStoredTranscript(mediaId);
  const sourceText = stored
    ? (stored.text || (stored.segments as any[])?.map((s: any) => s.text).join(' ') || '')
    : '';

  if (!sourceText) {
    return {
      type: 'text',
      content: '⚠️ No transcript found. Please transcribe the video first, then retry.',
    };
  }

  const client = buildAIClient();
  if (!client) {
    return { type: 'text', content: '⚠️ Requires BABELARK_API_KEY or OPENAI_API_KEY.' };
  }

  const model = process.env.BABELARK_MODEL || 'gpt-4o-mini';
  console.log('[Workflow] Removing filler words from transcript...');
  const cleanRes = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Remove all filler words and hesitations (um, uh, like, you know, 嗯, 啊, 那个, 就是, 然后, 对吧, 是吧) from this transcript. Return ONLY the cleaned text:\n\n${sourceText}`,
    }],
  });
  const cleanedText = cleanRes.choices[0]?.message?.content?.trim() || sourceText;

  return {
    type: 'text',
    content: `Filler words removed. Cleaned transcript:\n\n${cleanedText}`,
    metadata: { operation: 'remove_fillers', cleanedText },
  };
}

async function handleCustom(ctx: ToolContext): Promise<PreviewInfo> {
  const { step, mediaId } = ctx;
  const client = buildAIClient();
  if (!client) {
    return {
      type: 'data',
      content: `Operation "${step.description}" requires AI configuration (BABELARK_API_KEY or OPENAI_API_KEY).`,
      metadata: { operation: step.type, description: step.description, simulated: true },
    };
  }

  const stored = getStoredTranscript(mediaId);
  const transcriptSample = stored?.text?.slice(0, 300) || '';
  const model = process.env.BABELARK_MODEL || 'gpt-4o-mini';

  const analysisRes = await client.chat.completions.create({
    model,
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: 'You are a video editing assistant. In 1-2 sentences, describe exactly what changes would be applied to the video for the given editing request.',
      },
      {
        role: 'user',
        content: `Edit request: ${step.description}${transcriptSample ? `\nTranscript preview: "${transcriptSample}…"` : ''}`,
      },
    ],
  });
  const analysis = analysisRes.choices[0]?.message?.content?.trim()
    || `Operation "${step.description}" analyzed.`;

  return {
    type: 'text',
    content: analysis,
    metadata: { operation: step.type, description: step.description },
  };
}

// ── Register built-in tools ───────────────────────────────────────────────────
registerWorkflowTool('cut', handleCut);
registerWorkflowTool('trim', handleTrim);
registerWorkflowTool('translate', handleTranslate);
registerWorkflowTool('remove_fillers', handleRemoveFillers);
registerWorkflowTool('add_music', handleCustom);
registerWorkflowTool('custom', handleCustom);

/**
 * Execute a single workflow step and generate preview.
 * Dispatches to the registered tool handler for the step type.
 * Text-based operations (translate, remove_fillers, custom) always run.
 * Video operations (cut, trim) require the media file to exist.
 */
async function executeStepTask(
  step: WorkflowStep,
  mediaFilePath: string,
  previewDir: string,
  mediaId: string
): Promise<PreviewInfo> {
  const ctx: ToolContext = { step, mediaFilePath, mediaId, previewDir };
  const handler = toolRegistry.get(step.type) ?? toolRegistry.get('custom');
  if (!handler) {
    return {
      type: 'text',
      content: `No handler registered for step type "${step.type}".`,
      metadata: { operation: step.type },
    };
  }
  return handler(ctx);
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

    const mediaFilePath = workflow.mediaFilePath || '';
    const videoOps = new Set(['cut', 'trim']);
    const isVideoOp = videoOps.has(step.type);

    let preview: PreviewInfo;

    if (!isVideoOp) {
      // Text-based operations run regardless of whether the media file exists
      preview = await executeStepTask(step, mediaFilePath, previewDir, workflow.mediaId);
    } else if (mediaFilePath && fs.existsSync(mediaFilePath)) {
      // Video operations need the actual file
      preview = await executeStepTask(step, mediaFilePath, previewDir, workflow.mediaId);
    } else {
      console.log(`[Workflow] Simulation mode — media file not found: ${mediaFilePath}`);
      preview = {
        type: 'text',
        content: `Simulation: ${step.description} (media file not found)`,
        metadata: { simulated: true, operation: step.type },
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
