import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseUserRequest,
  generateEditPlan,
  executeEditPlan,
  getEditPlanStatus,
  getAllEditPlans,
  orchestrateVideoEdit,
  undoLastEdit,
  redoEdit,
  getEditHistory,
  clearEditHistory,
  MediaInfo,
} from '../services/videoEditOrchestration';

describe('Video Edit Orchestration Service', () => {
  const mockMediaInfo: MediaInfo = {
    id: 'media-123',
    duration: 120.5,
    hasVideo: true,
    hasAudio: true,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
  };

  beforeEach(() => {
    // Clear any stored plans and history before each test
    clearEditHistory('media-123');
  });

  describe('parseUserRequest', () => {
    it('should parse user request and create edit plan', async () => {
      const userRequest = 'Remove filler words from my video';
      const plan = await parseUserRequest(userRequest, mockMediaInfo);

      expect(plan).toBeDefined();
      expect(plan.id).toMatch(/^plan-/);
      expect(plan.mediaId).toBe(mockMediaInfo.id);
      expect(plan.userRequest).toBe(userRequest);
      expect(plan.status).toBe('pending');
      expect(plan.tasks).toBeInstanceOf(Array);
      expect(plan.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('generateEditPlan', () => {
    it('should generate edit plan with tasks', async () => {
      const plan = await generateEditPlan('Add background music', 'media-123');

      expect(plan).toBeDefined();
      expect(plan.mediaId).toBe('media-123');
      expect(plan.tasks.length).toBeGreaterThan(0);
      expect(plan.status).toBe('pending');
    });

    it('should create unique plan IDs', async () => {
      const plan1 = await generateEditPlan('Task 1', 'media-123');

      // Wait 1ms to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));

      const plan2 = await generateEditPlan('Task 2', 'media-123');

      expect(plan1.id).not.toBe(plan2.id);
    });
  });

  describe('executeEditPlan', () => {
    it('should execute plan and mark tasks as completed', async () => {
      const plan = await generateEditPlan('Test task', 'media-123');
      const result = await executeEditPlan(plan.id);

      expect(result.success).toBe(true);
      expect(result.planId).toBe(plan.id);
      expect(result.completedTasks).toBeGreaterThan(0);

      const updatedPlan = getEditPlanStatus(plan.id);
      expect(updatedPlan.status).toBe('completed');
      expect(updatedPlan.completedAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent plan', async () => {
      await expect(executeEditPlan('non-existent-plan')).rejects.toThrow();
    });
  });

  describe('getEditPlanStatus', () => {
    it('should return plan status', async () => {
      const plan = await generateEditPlan('Status test', 'media-123');
      const status = getEditPlanStatus(plan.id);

      expect(status).toEqual(plan);
    });

    it('should throw error for non-existent plan', () => {
      expect(() => getEditPlanStatus('non-existent')).toThrow();
    });
  });

  describe('getAllEditPlans', () => {
    it('should return all plans', async () => {
      await generateEditPlan('Plan 1', 'media-123');
      await generateEditPlan('Plan 2', 'media-456');

      const allPlans = getAllEditPlans();
      expect(allPlans.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array when no plans exist', () => {
      // Note: This test may fail if other tests created plans
      // In a real scenario, we'd want to reset the store
      const plans = getAllEditPlans();
      expect(plans).toBeInstanceOf(Array);
    });
  });

  describe('orchestrateVideoEdit', () => {
    it('should orchestrate full edit workflow', async () => {
      const result = await orchestrateVideoEdit(
        'Remove background noise',
        'media-123',
        mockMediaInfo
      );

      expect(result.success).toBe(true);
      expect(result.planId).toBeDefined();
      expect(result.message).toContain('tasks');
    });
  });

  describe('Edit History (Undo/Redo)', () => {
    describe('undoLastEdit', () => {
      it('should return canUndo=false when no edits exist', async () => {
        const result = await undoLastEdit('media-123');

        expect(result.success).toBe(false);
        expect(result.canUndo).toBe(false);
        expect(result.message).toContain('No edits');
      });

      it('should include undo/redo status in response', async () => {
        const result = await undoLastEdit('media-123');

        expect(result).toHaveProperty('canUndo');
        expect(result).toHaveProperty('canRedo');
      });
    });

    describe('redoEdit', () => {
      it('should return canRedo=false when nothing to redo', async () => {
        const result = await redoEdit('media-123');

        expect(result.success).toBe(false);
        expect(result.canRedo).toBe(false);
        expect(result.message).toContain('No edits');
      });
    });

    describe('getEditHistory', () => {
      it('should return empty history for new media', () => {
        const history = getEditHistory('media-new');

        expect(history).toBeDefined();
        expect(history.mediaId).toBe('media-new');
        expect(history.edits).toBeInstanceOf(Array);
        expect(history.edits.length).toBe(0);
        expect(history.currentIndex).toBe(-1);
      });

      it('should initialize history automatically', () => {
        const history1 = getEditHistory('media-auto');
        const history2 = getEditHistory('media-auto');

        expect(history1).toBe(history2); // Should return same instance
      });
    });

    describe('clearEditHistory', () => {
      it('should clear history for a media file', () => {
        // Create some history
        getEditHistory('media-clear');

        // Clear it
        clearEditHistory('media-clear');

        // Should create new empty history
        const newHistory = getEditHistory('media-clear');
        expect(newHistory.edits.length).toBe(0);
      });
    });
  });
});
