import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Get the base URL for static files (uploads)
export const getUploadUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
};

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Project APIs
export const projectApi = {
  getAll: () => api.get('/projects'),
  getById: (id: string) => api.get(`/projects/${id}`),
  create: (data: { name: string }) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

// Media APIs
export const mediaApi = {
  // Validate if file is a valid video/audio using FFprobe
  validate: (file: File): Promise<{
    data: {
      success: boolean;
      valid: boolean;
      type?: 'video' | 'audio' | 'unknown';
      duration?: number;
      width?: number;
      height?: number;
      codec?: string;
      format?: string;
      originalName?: string;
      size?: number;
      error?: string;
    }
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/media/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // 1 minute for validation
    });
  },

  upload: (formDataOrFile: FormData | File, optionsOrProjectId?: any, onProgress?: (progress: number) => void) => {
    let formData: FormData;
    let config: any = {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes for large files
    };

    if (formDataOrFile instanceof FormData) {
      formData = formDataOrFile;
      // Second param is options object with onUploadProgress
      if (optionsOrProjectId && optionsOrProjectId.onUploadProgress) {
        config.onUploadProgress = optionsOrProjectId.onUploadProgress;
      }
    } else {
      // Legacy: File + projectId + onProgress
      formData = new FormData();
      formData.append('file', formDataOrFile);
      if (typeof optionsOrProjectId === 'string') {
        formData.append('projectId', optionsOrProjectId);
      }
      if (onProgress) {
        config.onUploadProgress = (progressEvent: any) => {
          if (progressEvent.total) {
            onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        };
      }
    }

    return api.post('/media', formData, config);
  },
  
  uploadThumbnails: (mediaId: string, thumbnails: string[]) => {
    return api.post(`/media/${mediaId}/thumbnails`, { thumbnails }, {
      timeout: 300000, // 5 minutes for batch uploads
    });
  },
  
  getAll: (projectId?: string) => {
    const params = projectId ? { projectId } : {};
    return api.get('/media', { params });
  },
  
  getById: (mediaId: string) => api.get(`/media/${mediaId}`),
  
  delete: (mediaId: string) => api.delete(`/media/${mediaId}`),
  
  getStorageInfo: () => api.get('/media/storage/info'),
};

// Transcription APIs
export const transcriptionApi = {
  // New job-based API (T011, T012)
  startJob: (mediaId: string, filePath?: string, options?: { language?: string }) =>
    api.post('/transcriptions/start', { mediaId, filePath, ...options }),
  
  getJobStatus: (jobId: string) => 
    api.get(`/transcriptions/${jobId}/status`),
  
  retryJob: (jobId: string) => 
    api.post(`/transcriptions/${jobId}/retry`),
  
  cancelJob: (jobId: string) => 
    api.post(`/transcriptions/${jobId}/cancel`),

  // SSE stream for real-time updates
  createJobStream: (jobId: string): EventSource => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return new EventSource(`${baseUrl}/api/transcriptions/${jobId}/stream`);
  },

  // Legacy APIs (backward compatibility)
  start: (mediaId: string, options?: { language?: string }) =>
    api.post(`/media/${mediaId}/transcribe`, options),
  getStatus: (transcriptionId: string) => api.get(`/transcriptions/${transcriptionId}`),
  getByMedia: (mediaId: string) => api.get(`/media/${mediaId}/transcript`),
  update: (transcriptionId: string, segments: any[]) =>
    api.put(`/transcriptions/${transcriptionId}`, { segments }),
  create: (mediaId: string, mediaUrl?: string, options?: { language?: string }) =>
    api.post('/transcriptions', { mediaId, mediaUrl, ...options }),
  getById: (transcriptionId: string) => api.get(`/transcriptions/${transcriptionId}`),
  getByMediaId: (mediaId: string) => api.get(`/transcriptions/media/${mediaId}`),
};

// Export APIs (T035-T037)
export const exportApi = {
  // New job-based API
  startJob: (projectId: string, options: {
    sourceFile?: string;
    cutRegions?: Array<{ startTime: number; endTime: number }>;
    format?: 'mp4' | 'webm' | 'gif';
    resolution?: '2160p' | '1080p' | '720p' | '480p';
    quality?: 'high' | 'medium' | 'low';
  }) => api.post('/export/start', { projectId, ...options }),

  getJobStatus: (jobId: string) => 
    api.get(`/export/${jobId}/status`),

  cancelJob: (jobId: string) => 
    api.post(`/export/${jobId}/cancel`),

  download: (jobId: string) => 
    api.get(`/export/${jobId}/download`, { responseType: 'blob' }),

  // SSE stream for real-time progress
  createJobStream: (jobId: string): EventSource => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return new EventSource(`${baseUrl}/api/export/${jobId}/stream`);
  },

  // Legacy compatibility
  start: (projectId: string, options: any) =>
    api.post(`/projects/${projectId}/export`, options),
  getStatus: (exportId: string) => api.get(`/exports/${exportId}`),
};

// AI APIs (Claude/OpenAI via Babelark)
export const aiApi = {
  chat: (messages: Array<{role: 'user' | 'assistant', content: string}>, systemPrompt?: string) =>
    api.post('/ai/chat', { messages, systemPrompt }),
  getSkills: () => api.get('/ai/skills'),
  executeSkill: (skillName: string, data: { transcript: string; targetLanguage?: string; platform?: string }) =>
    api.post(`/ai/skills/${skillName}`, data),
  
  // AI Edit Workflow APIs
  planTasks: (request: string, context: { hasTranscript: boolean; transcript?: string; mediaType?: 'video' | 'audio'; duration?: number }) =>
    api.post('/ai/plan', { request, context }),
  executeTask: (task: any, transcript: string) =>
    api.post('/ai/execute-task', { task, transcript }),
  executeWorkflow: (tasks: any[], transcript: string) =>
    api.post('/ai/execute-workflow', { tasks, transcript }, { timeout: 120000 }), // 2 min timeout for multi-task
  
  // Video Edit Orchestration APIs
  orchestrateEdit: (
    userRequest: string,
    mediaId: string,
    mediaInfo: { duration: number; hasAudio: boolean; width?: number; height?: number },
    autoExecute: boolean = true
  ) => api.post('/ai/orchestrate', { userRequest, mediaId, mediaInfo, autoExecute }, { timeout: 180000 }), // 3 min timeout
  
  getPlanStatus: (planId: string) => api.get(`/ai/orchestrate/${planId}/status`),
  
  executePlan: (planId: string) => api.post(`/ai/orchestrate/${planId}/execute`, {}, { timeout: 180000 }),
  
  // Undo/Redo
  undo: (mediaId: string) => api.post(`/ai/orchestrate/${mediaId}/undo`),
  redo: (mediaId: string) => api.post(`/ai/orchestrate/${mediaId}/redo`),
  getHistory: (mediaId: string) => api.get(`/ai/orchestrate/${mediaId}/history`),
};

// Interactive Workflow APIs
export const workflowApi = {
  // Create workflow
  create: (
    userRequest: string,
    mediaId: string,
    mediaInfo: { duration: number; hasAudio: boolean; width?: number; height?: number }
  ) => api.post('/ai/workflow/create', { userRequest, mediaId, mediaInfo }, { timeout: 60000 }),

  // Get workflow status
  get: (workflowId: string) => api.get(`/ai/workflow/${workflowId}`),

  // Execute a step
  executeStep: (workflowId: string, stepId: string) =>
    api.post(`/ai/workflow/${workflowId}/step/${stepId}/execute`, {}, { timeout: 120000 }),

  // Confirm step
  confirmStep: (workflowId: string, stepId: string, approved: boolean) =>
    api.post(`/ai/workflow/${workflowId}/step/${stepId}/confirm`, { approved }),

  // Skip step
  skipStep: (workflowId: string, stepId: string) =>
    api.post(`/ai/workflow/${workflowId}/step/${stepId}/skip`),

  // Undo to previous step
  undo: (workflowId: string) => api.post(`/ai/workflow/${workflowId}/undo`),

  // Cancel workflow
  cancel: (workflowId: string) => api.post(`/ai/workflow/${workflowId}/cancel`),

  // List all workflows
  list: () => api.get('/ai/workflow/list'),

  // Delete workflow
  delete: (workflowId: string) => api.delete(`/ai/workflow/${workflowId}`),
};

// Direct file download helper
export const downloadEditedVideo = (filename: string): string => {
  return `${API_BASE_URL}/api/export/download/${filename}`;
};
