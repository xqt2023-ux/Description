import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

// Create a minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // AI routes mock
  app.post('/api/ai/plan', (req, res) => {
    const { request: userRequest, context } = req.body;
    
    if (!userRequest) {
      return res.status(400).json({
        success: false,
        error: 'Request text is required',
      });
    }

    res.json({
      success: true,
      data: {
        userIntent: 'Test intent',
        tasks: [
          { id: 'task-1', type: 'translate', name: 'Translate', status: 'pending' }
        ],
        summary: 'Test plan',
      },
    });
  });

  app.post('/api/ai/execute-task', (req, res) => {
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

    res.json({
      success: true,
      data: { result: 'Task executed successfully' },
    });
  });

  return app;
};

describe('API Routes', () => {
  const app = createTestApp();

  describe('Health Check', () => {
    it('GET /health returns status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('AI Plan Endpoint', () => {
    it('POST /api/ai/plan with valid request returns plan', async () => {
      const response = await request(app)
        .post('/api/ai/plan')
        .send({
          request: 'Translate to Chinese',
          context: { hasTranscript: true },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tasks).toBeDefined();
      expect(response.body.data.tasks.length).toBeGreaterThan(0);
    });

    it('POST /api/ai/plan without request returns error', async () => {
      const response = await request(app)
        .post('/api/ai/plan')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('AI Execute Task Endpoint', () => {
    it('POST /api/ai/execute-task with valid data succeeds', async () => {
      const response = await request(app)
        .post('/api/ai/execute-task')
        .send({
          task: { id: 'task-1', type: 'translate', name: 'Translate' },
          transcript: 'Hello world',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/ai/execute-task without task returns error', async () => {
      const response = await request(app)
        .post('/api/ai/execute-task')
        .send({ transcript: 'Hello world' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Task is required');
    });

    it('POST /api/ai/execute-task without transcript returns error', async () => {
      const response = await request(app)
        .post('/api/ai/execute-task')
        .send({ task: { id: 'task-1' } });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Transcript is required');
    });
  });
});
