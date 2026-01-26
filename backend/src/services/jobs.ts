/**
 * Job Service - Manages async job lifecycle (T005b)
 * 
 * Provides:
 * - Job creation and tracking
 * - Status updates and progress reporting
 * - Retry/cancel semantics
 * - In-memory store for MVP (can migrate to Redis/BullMQ)
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type JobType = 'transcription' | 'export' | 'thumbnail' | 'waveform';

export interface Job<T = unknown, R = unknown> {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  data: T;
  result?: R;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface JobCreateOptions<T> {
  type: JobType;
  data: T;
  maxRetries?: number;
}

export interface JobUpdateOptions {
  status?: JobStatus;
  progress?: number;
  result?: unknown;
  error?: string;
}

/**
 * In-memory job store (MVP)
 * TODO: Replace with Redis/BullMQ for production
 */
class JobStore {
  private jobs: Map<string, Job> = new Map();
  private emitter: EventEmitter = new EventEmitter();

  create<T>(options: JobCreateOptions<T>): Job<T> {
    const job: Job<T> = {
      id: uuidv4(),
      type: options.type,
      status: 'pending',
      progress: 0,
      data: options.data,
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: new Date().toISOString(),
    };
    
    this.jobs.set(job.id, job as Job);
    this.emitter.emit('job:created', job);
    return job;
  }

  get<T = unknown, R = unknown>(id: string): Job<T, R> | undefined {
    return this.jobs.get(id) as Job<T, R> | undefined;
  }

  update(id: string, options: JobUpdateOptions): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    if (options.status !== undefined) {
      job.status = options.status;
      
      if (options.status === 'processing' && !job.startedAt) {
        job.startedAt = new Date().toISOString();
      }
      
      if (options.status === 'completed' || options.status === 'failed') {
        job.completedAt = new Date().toISOString();
      }
      
      if (options.status === 'cancelled') {
        job.cancelledAt = new Date().toISOString();
      }
    }

    if (options.progress !== undefined) {
      job.progress = Math.min(100, Math.max(0, options.progress));
    }

    if (options.result !== undefined) {
      job.result = options.result;
    }

    if (options.error !== undefined) {
      job.error = options.error;
    }

    this.emitter.emit('job:updated', job);
    this.emitter.emit(`job:${id}:updated`, job);
    
    return job;
  }

  /**
   * Attempt to retry a failed job
   */
  retry(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    
    if (job.status !== 'failed') {
      return undefined; // Can only retry failed jobs
    }
    
    if (job.retryCount >= job.maxRetries) {
      return undefined; // Max retries exceeded
    }
    
    job.retryCount++;
    job.status = 'pending';
    job.progress = 0;
    job.error = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;
    
    this.emitter.emit('job:retry', job);
    return job;
  }

  /**
   * Cancel a pending or processing job
   */
  cancel(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    
    if (job.status === 'completed' || job.status === 'cancelled') {
      return undefined; // Cannot cancel completed/cancelled jobs
    }
    
    job.status = 'cancelled';
    job.cancelledAt = new Date().toISOString();
    
    this.emitter.emit('job:cancelled', job);
    this.emitter.emit(`job:${id}:cancelled`, job);
    
    return job;
  }

  /**
   * List jobs by type and/or status
   */
  list(options?: { type?: JobType; status?: JobStatus }): Job[] {
    let jobs = Array.from(this.jobs.values());
    
    if (options?.type) {
      jobs = jobs.filter(j => j.type === options.type);
    }
    
    if (options?.status) {
      jobs = jobs.filter(j => j.status === options.status);
    }
    
    return jobs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Subscribe to job updates
   */
  on(event: string, listener: (job: Job) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (job: Job) => void): void {
    this.emitter.off(event, listener);
  }

  /**
   * Clean up old completed/failed jobs (older than 1 hour)
   */
  cleanup(): number {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;
    
    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
        job.completedAt &&
        new Date(job.completedAt).getTime() < oneHourAgo
      ) {
        this.jobs.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

// Singleton instance
export const jobStore = new JobStore();

// Auto-cleanup every 30 minutes
setInterval(() => {
  const cleaned = jobStore.cleanup();
  if (cleaned > 0) {
    console.log(`[Jobs] Cleaned up ${cleaned} old jobs`);
  }
}, 30 * 60 * 1000);

/**
 * Helper to check if a job can be retried
 */
export function canRetry(job: Job): boolean {
  return job.status === 'failed' && job.retryCount < job.maxRetries;
}

/**
 * Helper to check if a job can be cancelled
 */
export function canCancel(job: Job): boolean {
  return job.status === 'pending' || job.status === 'processing';
}

/**
 * Convert job to API response format
 */
export function jobToResponse(job: Job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    canRetry: canRetry(job),
    canCancel: canCancel(job),
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}
