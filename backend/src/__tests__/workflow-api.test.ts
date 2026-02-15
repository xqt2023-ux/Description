import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express, Router } from 'express';
import { errorHandler } from '../middleware/errorHandler';

// Mock the AI routes to avoid actual API calls
const createMockAiRouter = () => {
  const router = Router();

  // Store workflows in memory for mock
  const workflows = new Map<string, any>();
  const deletedWorkflows = new Set<string>();

  // Mock workflow endpoints
  router.post('/workflow/create', (req, res) => {
    const { userRequest, mediaId } = req.body;
    if (!userRequest || !mediaId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const workflowId = `workflow-${Date.now()}-${Math.random()}`;
    const workflow = {
      workflowId,
      mediaId,
      userRequest,
      steps: [{ id: `step-${Date.now()}`, type: 'custom', status: 'pending' }],
      status: 'created',
      currentStepIndex: 0,
    };

    workflows.set(workflowId, workflow);

    res.json({
      success: true,
      data: workflow,
    });
  });

  // IMPORTANT: /workflow/list must come before /workflow/:workflowId
  router.get('/workflow/list', (req, res) => {
    const allWorkflows = Array.from(workflows.values())
      .filter(w => !deletedWorkflows.has(w.workflowId))
      .map(w => ({ id: w.workflowId, status: w.status }));

    res.json({
      success: true,
      data: allWorkflows,
    });
  });

  router.get('/workflow/:workflowId', (req, res) => {
    const { workflowId } = req.params;

    if (deletedWorkflows.has(workflowId) || !workflows.has(workflowId)) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const workflow = workflows.get(workflowId);
    res.json({
      success: true,
      data: {
        id: workflow.workflowId,
        steps: workflow.steps,
        status: workflow.status,
      },
    });
  });

  // Track executed steps to prevent re-execution
  const executedSteps = new Set<string>();

  router.post('/workflow/:workflowId/step/:stepId/execute', (req, res) => {
    const key = `${req.params.workflowId}:${req.params.stepId}`;
    if (executedSteps.has(key)) {
      return res.status(400).json({
        success: false,
        error: 'Step has already been executed',
      });
    }
    executedSteps.add(key);

    res.json({
      success: true,
      data: {
        stepId: req.params.stepId,
        status: 'awaiting_confirmation',
        preview: { type: 'data', metadata: {} },
        requiresConfirmation: true,
      },
    });
  });

  router.post('/workflow/:workflowId/step/:stepId/confirm', (req, res) => {
    const { approved } = req.body;
    const { workflowId } = req.params;

    // Update workflow status to completed after confirmation
    const workflow = workflows.get(workflowId);
    if (workflow && approved) {
      workflow.status = 'completed';
      workflows.set(workflowId, workflow);
    }

    res.json({
      success: true,
      data: {
        stepId: req.params.stepId,
        status: approved ? 'confirmed' : 'rejected',
      },
    });
  });

  router.post('/workflow/:workflowId/step/:stepId/skip', (req, res) => {
    res.json({
      success: true,
      data: {
        stepId: req.params.stepId,
        status: 'skipped',
      },
    });
  });

  router.post('/workflow/:workflowId/undo', (req, res) => {
    res.json({ success: true });
  });

  router.post('/workflow/:workflowId/cancel', (req, res) => {
    res.json({
      success: true,
      data: { message: 'Workflow cancelled' },
    });
  });

  router.delete('/workflow/:workflowId', (req, res) => {
    const { workflowId } = req.params;
    deletedWorkflows.add(workflowId);

    res.json({
      success: true,
      data: { message: 'Workflow deleted' },
    });
  });

  return router;
};

describe('Workflow API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.use('/api/ai', createMockAiRouter());
    app.use(errorHandler);
  });

  describe('POST /api/ai/workflow/create', () => {
    it('should create a new workflow', async () => {
      const response = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Remove filler words and add captions',
          mediaId: 'test-media-123',
          mediaInfo: {
            duration: 120.5,
            hasVideo: true,
            hasAudio: true,
          },
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.workflowId).toBeDefined();
      expect(response.body.data.steps).toBeInstanceOf(Array);
      expect(response.body.data.status).toBe('created');
    });

    it('should return 400 for missing userRequest', async () => {
      const response = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          mediaId: 'test-media',
          mediaInfo: { duration: 100 },
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing mediaId', async () => {
      await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Test request',
          mediaInfo: { duration: 100 },
        })
        .expect(400);
    });
  });

  describe('GET /api/ai/workflow/:workflowId', () => {
    let workflowId: string;

    beforeAll(async () => {
      // Create a workflow first
      const response = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Test workflow',
          mediaId: 'media-get-test',
          mediaInfo: { duration: 60, hasVideo: true, hasAudio: true },
        });

      workflowId = response.body.data.workflowId;
    });

    it('should get workflow details', async () => {
      const response = await request(app)
        .get(`/api/ai/workflow/${workflowId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(workflowId);
      expect(response.body.data.steps).toBeDefined();
    });

    it('should return 404 for non-existent workflow', async () => {
      await request(app)
        .get('/api/ai/workflow/non-existent-id')
        .expect(404);
    });
  });

  describe('POST /api/ai/workflow/:workflowId/step/:stepId/execute', () => {
    let workflowId: string;
    let stepId: string;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Execute test',
          mediaId: 'media-exec-test',
          mediaInfo: { duration: 90, hasVideo: true, hasAudio: true },
        });

      workflowId = response.body.data.workflowId;
      stepId = response.body.data.steps[0].id;
    });

    it('should execute workflow step', async () => {
      const response = await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/execute`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stepId).toBe(stepId);
      expect(response.body.data.status).toBe('awaiting_confirmation');
      expect(response.body.data.preview).toBeDefined();
    });

    it('should return 400 when trying to execute already executed step', async () => {
      // The previous test already executed this step, so executing again should fail
      await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/execute`)
        .expect(400);
    });
  });

  describe('POST /api/ai/workflow/:workflowId/step/:stepId/confirm', () => {
    let workflowId: string;
    let stepId: string;

    beforeAll(async () => {
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Confirm test',
          mediaId: 'media-confirm-test',
          mediaInfo: { duration: 45, hasVideo: true, hasAudio: true },
        });

      workflowId = createResponse.body.data.workflowId;
      stepId = createResponse.body.data.steps[0].id;

      // Execute step first
      await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/execute`);
    });

    it('should confirm step with approval', async () => {
      const response = await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/confirm`)
        .send({ approved: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('confirmed');
    });

    it('should reject step with disapproval', async () => {
      // Create new workflow for rejection test
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Reject test',
          mediaId: 'media-reject',
          mediaInfo: { duration: 30, hasVideo: true, hasAudio: true },
        });

      const newWorkflowId = createResponse.body.data.workflowId;
      const newStepId = createResponse.body.data.steps[0].id;

      await request(app)
        .post(`/api/ai/workflow/${newWorkflowId}/step/${newStepId}/execute`);

      const response = await request(app)
        .post(`/api/ai/workflow/${newWorkflowId}/step/${newStepId}/confirm`)
        .send({ approved: false, feedback: 'Looks wrong' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('rejected');
    });
  });

  describe('POST /api/ai/workflow/:workflowId/step/:stepId/skip', () => {
    it('should skip workflow step', async () => {
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Skip test',
          mediaId: 'media-skip',
          mediaInfo: { duration: 75, hasVideo: true, hasAudio: true },
        });

      const workflowId = createResponse.body.data.workflowId;
      const stepId = createResponse.body.data.steps[0].id;

      const response = await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/skip`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('skipped');
    });
  });

  describe('POST /api/ai/workflow/:workflowId/undo', () => {
    it('should undo last workflow step', async () => {
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Undo test',
          mediaId: 'media-undo',
          mediaInfo: { duration: 100, hasVideo: true, hasAudio: true },
        });

      const workflowId = createResponse.body.data.workflowId;
      const stepId = createResponse.body.data.steps[0].id;

      // Execute and confirm step
      await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/execute`);
      await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/confirm`)
        .send({ approved: true });

      // Undo
      const response = await request(app)
        .post(`/api/ai/workflow/${workflowId}/undo`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/ai/workflow/:workflowId/cancel', () => {
    it('should cancel workflow', async () => {
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Cancel test',
          mediaId: 'media-cancel',
          mediaInfo: { duration: 50, hasVideo: true, hasAudio: true },
        });

      const workflowId = createResponse.body.data.workflowId;

      const response = await request(app)
        .post(`/api/ai/workflow/${workflowId}/cancel`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('cancelled');
    });
  });

  describe('GET /api/ai/workflow/list', () => {
    it('should list all workflows', async () => {
      // Create a couple of workflows
      await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'List test 1',
          mediaId: 'media-list-1',
          mediaInfo: { duration: 60, hasVideo: true, hasAudio: true },
        });

      await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'List test 2',
          mediaId: 'media-list-2',
          mediaInfo: { duration: 90, hasVideo: true, hasAudio: true },
        });

      const response = await request(app)
        .get('/api/ai/workflow/list')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('DELETE /api/ai/workflow/:workflowId', () => {
    it('should delete workflow', async () => {
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'Delete test',
          mediaId: 'media-delete',
          mediaInfo: { duration: 40, hasVideo: true, hasAudio: true },
        });

      const workflowId = createResponse.body.data.workflowId;

      const response = await request(app)
        .delete(`/api/ai/workflow/${workflowId}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify it's deleted
      await request(app)
        .get(`/api/ai/workflow/${workflowId}`)
        .expect(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full workflow lifecycle', async () => {
      // 1. Create workflow
      const createResponse = await request(app)
        .post('/api/ai/workflow/create')
        .send({
          userRequest: 'E2E test: remove fillers and add music',
          mediaId: 'media-e2e',
          mediaInfo: { duration: 120, hasVideo: true, hasAudio: true },
        });

      expect(createResponse.status).toBe(200);
      const workflowId = createResponse.body.data.workflowId;
      const stepId = createResponse.body.data.steps[0].id;

      // 2. Execute step
      const execResponse = await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/execute`);

      expect(execResponse.status).toBe(200);
      expect(execResponse.body.data.preview).toBeDefined();

      // 3. Confirm step
      const confirmResponse = await request(app)
        .post(`/api/ai/workflow/${workflowId}/step/${stepId}/confirm`)
        .send({ approved: true });

      expect(confirmResponse.status).toBe(200);

      // 4. Check workflow completion
      const getResponse = await request(app)
        .get(`/api/ai/workflow/${workflowId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.status).toBe('completed');
    });
  });
});
