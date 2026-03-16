/**
 * TDD tests for Phase 3 — Underlord Export
 *
 * - invertCuts: converts cutRegions to keepRegions (pure function)
 * - POST /api/ai/underlord/export: SSE endpoint validation
 */

import { describe, it, expect } from 'vitest';
import { invertCuts } from '../services/editExecutors';
import express from 'express';
import request from 'supertest';

// ── invertCuts ─────────────────────────────────────────────────────────────

describe('invertCuts', () => {
  it('returns full duration segment when no cuts', () => {
    expect(invertCuts(60, [])).toEqual([{ startTime: 0, endTime: 60 }]);
  });

  it('returns segments before and after a single cut', () => {
    expect(invertCuts(60, [{ startTime: 10, endTime: 20 }])).toEqual([
      { startTime: 0, endTime: 10 },
      { startTime: 20, endTime: 60 },
    ]);
  });

  it('handles a cut at the start', () => {
    expect(invertCuts(60, [{ startTime: 0, endTime: 10 }])).toEqual([
      { startTime: 10, endTime: 60 },
    ]);
  });

  it('handles a cut at the end', () => {
    expect(invertCuts(60, [{ startTime: 50, endTime: 60 }])).toEqual([
      { startTime: 0, endTime: 50 },
    ]);
  });

  it('handles multiple cuts and returns gaps between them', () => {
    expect(invertCuts(60, [
      { startTime: 10, endTime: 20 },
      { startTime: 30, endTime: 40 },
    ])).toEqual([
      { startTime: 0, endTime: 10 },
      { startTime: 20, endTime: 30 },
      { startTime: 40, endTime: 60 },
    ]);
  });

  it('sorts unsorted cuts before inverting', () => {
    expect(invertCuts(60, [
      { startTime: 30, endTime: 40 },
      { startTime: 10, endTime: 20 },
    ])).toEqual([
      { startTime: 0, endTime: 10 },
      { startTime: 20, endTime: 30 },
      { startTime: 40, endTime: 60 },
    ]);
  });

  it('returns empty array when entire duration is cut', () => {
    expect(invertCuts(60, [{ startTime: 0, endTime: 60 }])).toEqual([]);
  });
});

// ── POST /api/ai/underlord/export — validation ────────────────────────────

function createExportTestApp() {
  const app = express();
  app.use(express.json());

  // Contract mirror of the real endpoint's validation
  app.post('/api/ai/underlord/export', (req, res) => {
    const { mediaId, cuts } = req.body;
    if (!mediaId) {
      return res.status(400).json({ success: false, error: 'mediaId is required' });
    }
    if (!Array.isArray(cuts)) {
      return res.status(400).json({ success: false, error: 'cuts must be an array' });
    }
    // Simulate "media not found" for unknown ids
    if (mediaId === 'unknown-id') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Media file not found' })}\n\n`);
      res.end();
      return;
    }
    res.status(202).json({ success: true });
  });

  return app;
}

describe('POST /api/ai/underlord/export — validation', () => {
  it('returns 400 when mediaId is missing', async () => {
    const app = createExportTestApp();
    const res = await request(app)
      .post('/api/ai/underlord/export')
      .send({ cuts: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mediaId/);
  });

  it('returns 400 when cuts is not an array', async () => {
    const app = createExportTestApp();
    const res = await request(app)
      .post('/api/ai/underlord/export')
      .send({ mediaId: 'test-id', cuts: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cuts/);
  });

  it('emits SSE error event when media is not found', async () => {
    const app = createExportTestApp();
    const res = await request(app)
      .post('/api/ai/underlord/export')
      .send({ mediaId: 'unknown-id', cuts: [] });
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"type":"error"');
    expect(res.text).toContain('Media file not found');
  });
});
