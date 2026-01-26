import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment variables
vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');

describe('AI Service - Task Planning', () => {
  it('should export planEditTasks function', async () => {
    const claude = await import('../services/claude');
    expect(claude.planEditTasks).toBeDefined();
    expect(typeof claude.planEditTasks).toBe('function');
  });

  it('should export executeEditTask function', async () => {
    const claude = await import('../services/claude');
    expect(claude.executeEditTask).toBeDefined();
    expect(typeof claude.executeEditTask).toBe('function');
  });
});

describe('AI Service - Skills', () => {
  it('should export removeFillerWords function', async () => {
    const claude = await import('../services/claude');
    expect(claude.removeFillerWords).toBeDefined();
  });

  it('should export generateSummary function', async () => {
    const claude = await import('../services/claude');
    expect(claude.generateSummary).toBeDefined();
  });

  it('should export translateTranscript function', async () => {
    const claude = await import('../services/claude');
    expect(claude.translateTranscript).toBeDefined();
  });

  it('should export generateChapters function', async () => {
    const claude = await import('../services/claude');
    expect(claude.generateChapters).toBeDefined();
  });
});
