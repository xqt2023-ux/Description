/**
 * Jobs API Routes (T005b)
 * 
 * Endpoints:
 * - GET /api/jobs - List jobs with optional filters
 * - GET /api/jobs/:id - Get job status
 * - POST /api/jobs/:id/retry - Retry a failed job
 * - POST /api/jobs/:id/cancel - Cancel a pending/processing job
 */

import { Router, Request, Response } from 'express';
import { jobStore, jobToResponse, canRetry, canCancel, JobType, JobStatus } from '../services/jobs';
import { Errors } from '../middleware/errorHandler';

export const jobRoutes = Router();

/**
 * GET /api/jobs
 * List all jobs with optional filtering
 */
jobRoutes.get('/', (req: Request, res: Response) => {
  const { type, status } = req.query;
  
  const jobs = jobStore.list({
    type: type as JobType | undefined,
    status: status as JobStatus | undefined,
  });
  
  res.json({
    success: true,
    data: jobs.map(jobToResponse),
  });
});

/**
 * GET /api/jobs/:id
 * Get a specific job's status
 */
jobRoutes.get('/:id', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.id);
  
  if (!job) {
    throw Errors.notFound('Job');
  }
  
  res.json({
    success: true,
    data: jobToResponse(job),
  });
});

/**
 * POST /api/jobs/:id/retry
 * Retry a failed job
 */
jobRoutes.post('/:id/retry', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.id);
  
  if (!job) {
    throw Errors.notFound('Job');
  }
  
  if (!canRetry(job)) {
    throw Errors.validation(
      job.status !== 'failed' 
        ? 'Only failed jobs can be retried'
        : 'Maximum retry attempts exceeded',
      { retryCount: job.retryCount, maxRetries: job.maxRetries }
    );
  }
  
  const retriedJob = jobStore.retry(req.params.id);
  
  res.json({
    success: true,
    data: jobToResponse(retriedJob!),
    message: `Job queued for retry (attempt ${retriedJob!.retryCount}/${retriedJob!.maxRetries})`,
  });
});

/**
 * POST /api/jobs/:id/cancel
 * Cancel a pending or processing job
 */
jobRoutes.post('/:id/cancel', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.id);
  
  if (!job) {
    throw Errors.notFound('Job');
  }
  
  if (!canCancel(job)) {
    throw Errors.validation(
      `Cannot cancel job with status '${job.status}'`
    );
  }
  
  const cancelledJob = jobStore.cancel(req.params.id);
  
  res.json({
    success: true,
    data: jobToResponse(cancelledJob!),
    message: 'Job cancelled successfully',
  });
});
