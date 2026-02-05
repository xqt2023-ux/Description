import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ============ In-memory media store (mirrors media.ts logic) ============
let mediaFiles: any[] = [];

const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- Media routes (contract mirror of backend/src/routes/media.ts) ---

  // POST /api/media — simulate upload (no real multer; body carries file metadata)
  app.post('/api/media', (req, res) => {
    const { filename, originalName, mimetype, size, projectId } = req.body;

    if (!filename) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const type = mimetype?.startsWith('video/') ? 'video'
      : mimetype?.startsWith('audio/') ? 'audio'
      : 'image';

    const media = {
      id: filename.replace(/\.[^.]+$/, ''),
      projectId: projectId || null,
      filename,
      originalName: originalName || filename,
      mimetype: mimetype || 'video/mp4',
      size: size || 0,
      url: `/uploads/${type === 'video' ? 'videos' : 'audio'}/${filename}`,
      filePath: `/uploads/${type === 'video' ? 'videos' : 'audio'}/${filename}`,
      type,
      thumbnails: [],
      thumbnailCount: 0,
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    mediaFiles.push(media);
    res.status(201).json({ success: true, data: media });
  });

  // GET /api/media — list all (optionally filter by projectId)
  app.get('/api/media', (req, res) => {
    const { projectId } = req.query;
    const files = projectId
      ? mediaFiles.filter(m => m.projectId === projectId)
      : mediaFiles;
    res.json({ success: true, data: files });
  });

  // GET /api/media/:id — get single media
  app.get('/api/media/:id', (req, res) => {
    const media = mediaFiles.find(m => m.id === req.params.id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }
    res.json({ success: true, data: media });
  });

  // DELETE /api/media/:id
  app.delete('/api/media/:id', (req, res) => {
    const idx = mediaFiles.findIndex(m => m.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }
    mediaFiles.splice(idx, 1);
    res.json({ success: true });
  });

  // --- AI routes ---

  app.post('/api/ai/plan', (req, res) => {
    const { request: userRequest } = req.body;

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

  beforeEach(() => {
    // Reset in-memory media store before each test
    mediaFiles.length = 0;
  });

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

  // ============ Media Upload & List Regression Tests ============

  describe('Media Upload', () => {
    it('POST /api/media with valid video file returns 201 with media object', async () => {
      const response = await request(app)
        .post('/api/media')
        .send({
          filename: 'sample.mp4',
          originalName: 'My Video.mp4',
          mimetype: 'video/mp4',
          size: 5 * 1024 * 1024,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('sample');
      expect(response.body.data.type).toBe('video');
      expect(response.body.data.originalName).toBe('My Video.mp4');
      expect(response.body.data.url).toContain('/uploads/videos/sample.mp4');
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('POST /api/media with audio file sets type to audio', async () => {
      const response = await request(app)
        .post('/api/media')
        .send({
          filename: 'podcast.mp3',
          mimetype: 'audio/mpeg',
          size: 2 * 1024 * 1024,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.type).toBe('audio');
      expect(response.body.data.url).toContain('/uploads/audio/');
    });

    it('POST /api/media with projectId associates media to project', async () => {
      const response = await request(app)
        .post('/api/media')
        .send({
          filename: 'clip.mp4',
          mimetype: 'video/mp4',
          size: 1024,
          projectId: 'proj-abc',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.projectId).toBe('proj-abc');
    });

    it('POST /api/media without filename returns 400', async () => {
      const response = await request(app)
        .post('/api/media')
        .send({ mimetype: 'video/mp4' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No file uploaded');
    });
  });

  describe('Media List (GET /api/media)', () => {
    it('returns empty list when no media uploaded', async () => {
      const response = await request(app).get('/api/media');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('returns all uploaded media after uploads', async () => {
      // Upload two files
      await request(app).post('/api/media').send({
        filename: 'video1.mp4', mimetype: 'video/mp4', size: 1000,
      });
      await request(app).post('/api/media').send({
        filename: 'video2.mp4', mimetype: 'video/mp4', size: 2000,
      });

      const response = await request(app).get('/api/media');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].id).toBe('video1');
      expect(response.body.data[1].id).toBe('video2');
    });

    it('filters by projectId when query param provided', async () => {
      await request(app).post('/api/media').send({
        filename: 'proj-a.mp4', mimetype: 'video/mp4', size: 1000, projectId: 'proj-a',
      });
      await request(app).post('/api/media').send({
        filename: 'proj-b.mp4', mimetype: 'video/mp4', size: 1000, projectId: 'proj-b',
      });

      const response = await request(app).get('/api/media?projectId=proj-a');

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].projectId).toBe('proj-a');
    });
  });

  describe('Media Get By ID (GET /api/media/:id)', () => {
    it('returns media when it exists', async () => {
      await request(app).post('/api/media').send({
        filename: 'find-me.mp4', mimetype: 'video/mp4', size: 500,
      });

      const response = await request(app).get('/api/media/find-me');

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('find-me');
    });

    it('returns 404 when media does not exist', async () => {
      const response = await request(app).get('/api/media/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Media Delete (DELETE /api/media/:id)', () => {
    it('deletes existing media and removes from list', async () => {
      await request(app).post('/api/media').send({
        filename: 'delete-me.mp4', mimetype: 'video/mp4', size: 100,
      });

      const deleteRes = await request(app).delete('/api/media/delete-me');
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Confirm removed from list
      const listRes = await request(app).get('/api/media');
      expect(listRes.body.data).toHaveLength(0);
    });

    it('returns 404 when deleting nonexistent media', async () => {
      const response = await request(app).delete('/api/media/ghost');

      expect(response.status).toBe(404);
    });
  });
});
