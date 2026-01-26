import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

describe('API Client', () => {
  it('should be configured correctly', async () => {
    const { api } = await import('@/lib/api');
    expect(api).toBeDefined();
  });
});

describe('AI API Endpoints', () => {
  it('planTasks should be callable', async () => {
    const { aiApi } = await import('@/lib/api');
    expect(aiApi.planTasks).toBeDefined();
    expect(typeof aiApi.planTasks).toBe('function');
  });

  it('executeTask should be callable', async () => {
    const { aiApi } = await import('@/lib/api');
    expect(aiApi.executeTask).toBeDefined();
    expect(typeof aiApi.executeTask).toBe('function');
  });

  it('executeWorkflow should be callable', async () => {
    const { aiApi } = await import('@/lib/api');
    expect(aiApi.executeWorkflow).toBeDefined();
    expect(typeof aiApi.executeWorkflow).toBe('function');
  });
});

describe('Media API Endpoints', () => {
  it('upload should be callable', async () => {
    const { mediaApi } = await import('@/lib/api');
    expect(mediaApi.upload).toBeDefined();
    expect(typeof mediaApi.upload).toBe('function');
  });

  it('getAll should be callable', async () => {
    const { mediaApi } = await import('@/lib/api');
    expect(mediaApi.getAll).toBeDefined();
    expect(typeof mediaApi.getAll).toBe('function');
  });
});

describe('URL Helper', () => {
  it('getUploadUrl handles relative paths', async () => {
    const { getUploadUrl } = await import('@/lib/api');
    const url = getUploadUrl('/uploads/test.mp4');
    expect(url).toContain('/uploads/test.mp4');
  });

  it('getUploadUrl handles absolute URLs', async () => {
    const { getUploadUrl } = await import('@/lib/api');
    const url = getUploadUrl('https://example.com/video.mp4');
    expect(url).toBe('https://example.com/video.mp4');
  });

  it('getUploadUrl handles blob URLs', async () => {
    const { getUploadUrl } = await import('@/lib/api');
    const url = getUploadUrl('blob:http://localhost/123');
    expect(url).toBe('blob:http://localhost/123');
  });
});
