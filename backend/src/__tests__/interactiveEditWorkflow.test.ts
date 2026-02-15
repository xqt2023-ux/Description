import { describe, it, expect, beforeEach } from 'vitest';
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
import { MediaInfo } from '../services/videoEditOrchestration';

describe('Interactive Edit Workflow Service', () => {
  const mockMediaInfo: MediaInfo = {
    id: 'media-456',
    duration: 180.0,
    hasVideo: true,
    hasAudio: true,
  };

  let workflowId: string;

  beforeEach(async () => {
    // Create a fresh workflow for each test
    const workflow = await createInteractiveWorkflow(
      'Test workflow request',
      'media-456',
      mockMediaInfo
    );
    workflowId = workflow.id;
  });

  describe('createInteractiveWorkflow', () => {
    it('should create workflow with correct structure', async () => {
      const workflow = await createInteractiveWorkflow(
        'Remove silence from video',
        'media-789',
        mockMediaInfo
      );

      expect(workflow).toBeDefined();
      expect(workflow.id).toMatch(/^workflow-/);
      expect(workflow.mediaId).toBe('media-789');
      expect(workflow.userRequest).toBe('Remove silence from video');
      expect(workflow.status).toBe('created');
      expect(workflow.steps).toBeInstanceOf(Array);
      expect(workflow.steps.length).toBeGreaterThan(0);
      expect(workflow.currentStepIndex).toBe(0);
      expect(workflow.createdAt).toBeInstanceOf(Date);
    });

    it('should create steps with correct properties', async () => {
      const workflow = await createInteractiveWorkflow(
        'Test request',
        'media-test',
        mockMediaInfo
      );

      const firstStep = workflow.steps[0];
      expect(firstStep).toBeDefined();
      expect(firstStep.id).toBeDefined();
      expect(firstStep.status).toBe('pending');
      expect(firstStep.requiresConfirmation).toBeDefined();
    });
  });

  describe('executeWorkflowStep', () => {
    it('should execute step and generate preview', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      const result = await executeWorkflowStep(workflowId, stepId);

      expect(result.stepId).toBe(stepId);
      expect(result.status).toBe('awaiting_confirmation');
      expect(result.preview).toBeDefined();
      expect(result.requiresConfirmation).toBe(true);
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(
        executeWorkflowStep('non-existent', 'step-1')
      ).rejects.toThrow('Workflow');
    });

    it('should throw error for non-existent step', async () => {
      await expect(
        executeWorkflowStep(workflowId, 'non-existent-step')
      ).rejects.toThrow('step');
    });

    it('should prevent executing already executed step', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      // Execute once
      await executeWorkflowStep(workflowId, stepId);

      // Try to execute again
      await expect(
        executeWorkflowStep(workflowId, stepId)
      ).rejects.toThrow('already been executed');
    });
  });

  describe('confirmStep', () => {
    it('should confirm step and move to next', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      // Execute step first
      await executeWorkflowStep(workflowId, stepId);

      // Confirm it
      const result = await confirmStep(workflowId, stepId, true);

      expect(result.stepId).toBe(stepId);
      expect(result.status).toBe('confirmed');

      const updatedWorkflow = getWorkflow(workflowId);
      expect(updatedWorkflow.currentStepIndex).toBe(1);
    });

    it('should reject step when approved=false', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      await executeWorkflowStep(workflowId, stepId);

      const result = await confirmStep(workflowId, stepId, false, 'Not good');

      expect(result.stepId).toBe(stepId);
      expect(result.status).toBe('rejected');
    });

    it('should complete workflow when last step is confirmed', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      await executeWorkflowStep(workflowId, stepId);
      await confirmStep(workflowId, stepId, true);

      const updatedWorkflow = getWorkflow(workflowId);
      expect(updatedWorkflow.status).toBe('completed');
      expect(updatedWorkflow.completedAt).toBeInstanceOf(Date);
    });

    it('should throw error for step not awaiting confirmation', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      await expect(
        confirmStep(workflowId, stepId, true)
      ).rejects.toThrow('not awaiting confirmation');
    });
  });

  describe('skipStep', () => {
    it('should skip step and move to next', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      const result = await skipStep(workflowId, stepId);

      expect(result.stepId).toBe(stepId);
      expect(result.status).toBe('skipped');

      const updatedWorkflow = getWorkflow(workflowId);
      expect(updatedWorkflow.currentStepIndex).toBe(1);
    });

    it('should complete workflow when last step is skipped', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      await skipStep(workflowId, stepId);

      const updatedWorkflow = getWorkflow(workflowId);
      expect(updatedWorkflow.status).toBe('completed');
    });
  });

  describe('undoStep', () => {
    it('should undo to previous step', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      // Execute and confirm a step
      await executeWorkflowStep(workflowId, stepId);
      await confirmStep(workflowId, stepId, true);

      // Undo
      const result = await undoStep(workflowId);

      expect(result.success).toBe(true);
      expect(result.currentStep).toBe(stepId);

      const updatedWorkflow = getWorkflow(workflowId);
      expect(updatedWorkflow.currentStepIndex).toBe(0);
    });

    it('should return error when at first step', async () => {
      const result = await undoStep(workflowId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('first step');
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel workflow', async () => {
      const result = await cancelWorkflow(workflowId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('cancelled');

      const workflow = getWorkflow(workflowId);
      expect(workflow.status).toBe('cancelled');
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow details', () => {
      const workflow = getWorkflow(workflowId);

      expect(workflow).toBeDefined();
      expect(workflow.id).toBe(workflowId);
    });

    it('should throw error for non-existent workflow', () => {
      expect(() => getWorkflow('non-existent')).toThrow();
    });
  });

  describe('getAllWorkflows', () => {
    it('should return all workflows', async () => {
      await createInteractiveWorkflow('Another workflow', 'media-2', mockMediaInfo);

      const workflows = getAllWorkflows();
      expect(workflows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete workflow', async () => {
      const result = await deleteWorkflow(workflowId);

      expect(result.success).toBe(true);

      expect(() => getWorkflow(workflowId)).toThrow();
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(deleteWorkflow('non-existent')).rejects.toThrow();
    });
  });

  describe('Workflow State Management', () => {
    it('should maintain correct step status transitions', async () => {
      const workflow = getWorkflow(workflowId);
      const step = workflow.steps[0];

      // Initial status
      expect(step.status).toBe('pending');

      // After execution
      await executeWorkflowStep(workflowId, step.id);
      const afterExecute = getWorkflow(workflowId).steps[0];
      expect(afterExecute.status).toBe('awaiting_confirmation');

      // After confirmation
      await confirmStep(workflowId, step.id, true);
      const afterConfirm = getWorkflow(workflowId).steps[0];
      expect(afterConfirm.status).toBe('confirmed');
    });

    it('should preserve preview data after execution', async () => {
      const workflow = getWorkflow(workflowId);
      const stepId = workflow.steps[0].id;

      await executeWorkflowStep(workflowId, stepId);

      const updatedWorkflow = getWorkflow(workflowId);
      const step = updatedWorkflow.steps.find(s => s.id === stepId);

      expect(step?.preview).toBeDefined();
      expect(step?.preview?.type).toBe('data');
    });
  });
});
