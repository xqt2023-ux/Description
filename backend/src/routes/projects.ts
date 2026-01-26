/**
 * Project CRUD Routes (T007b)
 * 
 * Endpoints:
 * - GET /api/projects - List all projects
 * - GET /api/projects/:id - Get project by ID
 * - POST /api/projects - Create new project
 * - PUT /api/projects/:id - Update project
 * - DELETE /api/projects/:id - Delete project
 * - PUT /api/projects/:id/timeline - Update timeline (partial)
 * - PUT /api/projects/:id/transcript - Update transcript (partial)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { projectStorage } from '../services/storage';
import { Errors } from '../middleware/errorHandler';
import { Project, Timeline, Transcript } from '../../../shared/types';

const router = Router();

/**
 * GET /api/projects
 * List all projects
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await projectStorage.list();
    
    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/:id
 * Get project by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await projectStorage.get(req.params.id);
    
    if (!project) {
      throw Errors.notFound('Project');
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/projects
 * Create new project
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, ownerId } = req.body;

    const project = await projectStorage.create({
      name: name || 'Untitled Project',
      ownerId,
    });

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/projects/:id
 * Update project (full update)
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates: Partial<Project> = req.body;
    
    // Prevent changing ID
    delete updates.id;
    
    const project = await projectStorage.update(req.params.id, updates);

    if (!project) {
      throw Errors.notFound('Project');
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/projects/:id/timeline
 * Update project timeline only
 */
router.put('/:id/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const timeline: Timeline = req.body;
    
    if (!timeline || !timeline.tracks) {
      throw Errors.validation('Invalid timeline data');
    }

    const project = await projectStorage.updateTimeline(req.params.id, timeline);

    if (!project) {
      throw Errors.notFound('Project');
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/projects/:id/transcript
 * Update project transcript only
 */
router.put('/:id/transcript', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transcript: Transcript = req.body;
    
    if (!transcript || !transcript.segments) {
      throw Errors.validation('Invalid transcript data');
    }

    const project = await projectStorage.updateTranscript(req.params.id, transcript);

    if (!project) {
      throw Errors.notFound('Project');
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/projects/:id
 * Delete project
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await projectStorage.delete(req.params.id);

    if (!deleted) {
      throw Errors.notFound('Project');
    }

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export { router as projectRoutes };
