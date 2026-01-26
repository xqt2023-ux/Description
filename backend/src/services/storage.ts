import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Storage configuration
export interface StorageConfig {
  type: 'local' | 'bos';
  local?: {
    uploadDir: string;
    baseUrl: string;
  };
  bos?: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
  };
}

export interface UploadResult {
  id: string;
  filename: string;
  url: string;
  size: number;
  mimetype: string;
}

// Abstract storage interface
interface IStorageProvider {
  upload(file: Express.Multer.File, folder?: string): Promise<UploadResult>;
  uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder?: string): Promise<UploadResult>;
  delete(filename: string, folder?: string): Promise<void>;
  getUrl(filename: string, folder?: string): string;
}

// Local storage provider
class LocalStorageProvider implements IStorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor(config: StorageConfig['local']) {
    this.uploadDir = config?.uploadDir || './uploads';
    this.baseUrl = config?.baseUrl || '/uploads';
    
    // Ensure directories exist
    this.ensureDir(this.uploadDir);
    this.ensureDir(path.join(this.uploadDir, 'videos'));
    this.ensureDir(path.join(this.uploadDir, 'thumbnails'));
    this.ensureDir(path.join(this.uploadDir, 'audio'));
    this.ensureDir(path.join(this.uploadDir, 'images'));
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async upload(file: Express.Multer.File, folder: string = ''): Promise<UploadResult> {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const targetDir = folder ? path.join(this.uploadDir, folder) : this.uploadDir;
    const targetPath = path.join(targetDir, filename);

    this.ensureDir(targetDir);

    // Move file from temp to target
    if (file.path) {
      fs.renameSync(file.path, targetPath);
    } else if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    }

    return {
      id: uuidv4(),
      filename,
      url: this.getUrl(filename, folder),
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder: string = ''): Promise<UploadResult> {
    const targetDir = folder ? path.join(this.uploadDir, folder) : this.uploadDir;
    const targetPath = path.join(targetDir, filename);

    this.ensureDir(targetDir);
    fs.writeFileSync(targetPath, buffer);

    return {
      id: uuidv4(),
      filename,
      url: this.getUrl(filename, folder),
      size: buffer.length,
      mimetype,
    };
  }

  async delete(filename: string, folder: string = ''): Promise<void> {
    const targetDir = folder ? path.join(this.uploadDir, folder) : this.uploadDir;
    const targetPath = path.join(targetDir, filename);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  }

  getUrl(filename: string, folder: string = ''): string {
    return folder ? `${this.baseUrl}/${folder}/${filename}` : `${this.baseUrl}/${filename}`;
  }
}

// Baidu BOS storage provider
class BOSStorageProvider implements IStorageProvider {
  private config: StorageConfig['bos'];
  private BosClient: any;
  private client: any;

  constructor(config: StorageConfig['bos']) {
    this.config = config;
    
    // Dynamic import for @baiducloud/sdk
    // Note: You need to install @baiducloud/sdk: npm install @baiducloud/sdk
    try {
      const BOS = require('@baiducloud/sdk').BosClient;
      this.BosClient = BOS;
      this.client = new BOS({
        endpoint: config?.endpoint || 'https://bj.bcebos.com',
        credentials: {
          ak: config?.accessKeyId || '',
          sk: config?.secretAccessKey || '',
        },
      });
    } catch (e) {
      console.warn('Baidu BOS SDK not installed. Run: npm install @baiducloud/sdk');
      this.client = null;
    }
  }

  async upload(file: Express.Multer.File, folder: string = ''): Promise<UploadResult> {
    if (!this.client) {
      throw new Error('BOS client not initialized. Please install @baiducloud/sdk');
    }

    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const key = folder ? `${folder}/${filename}` : filename;

    let buffer: Buffer;
    if (file.path) {
      buffer = fs.readFileSync(file.path);
      // Clean up temp file
      fs.unlinkSync(file.path);
    } else if (file.buffer) {
      buffer = file.buffer;
    } else {
      throw new Error('No file data available');
    }

    await this.client.putObject(this.config?.bucket, key, buffer, {
      'Content-Type': file.mimetype,
    });

    return {
      id: uuidv4(),
      filename,
      url: this.getUrl(filename, folder),
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder: string = ''): Promise<UploadResult> {
    if (!this.client) {
      throw new Error('BOS client not initialized. Please install @baiducloud/sdk');
    }

    const key = folder ? `${folder}/${filename}` : filename;

    await this.client.putObject(this.config?.bucket, key, buffer, {
      'Content-Type': mimetype,
    });

    return {
      id: uuidv4(),
      filename,
      url: this.getUrl(filename, folder),
      size: buffer.length,
      mimetype,
    };
  }

  async delete(filename: string, folder: string = ''): Promise<void> {
    if (!this.client) {
      throw new Error('BOS client not initialized');
    }

    const key = folder ? `${folder}/${filename}` : filename;
    await this.client.deleteObject(this.config?.bucket, key);
  }

  getUrl(filename: string, folder: string = ''): string {
    const key = folder ? `${folder}/${filename}` : filename;
    // Public URL format for Baidu BOS
    return `https://${this.config?.bucket}.${this.config?.region || 'bj'}.bcebos.com/${key}`;
  }
}

// Storage service factory
class StorageService {
  private provider: IStorageProvider;
  private config: StorageConfig;

  constructor() {
    // Load config from environment
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
    this.config = {
      type: (process.env.STORAGE_TYPE as 'local' | 'bos') || 'local',
      local: {
        uploadDir: process.env.UPLOAD_DIR || './uploads',
        baseUrl: process.env.UPLOAD_BASE_URL || `${serverUrl}/uploads`,
      },
      bos: {
        endpoint: process.env.BOS_ENDPOINT || 'https://bj.bcebos.com',
        accessKeyId: process.env.BOS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.BOS_SECRET_ACCESS_KEY || '',
        bucket: process.env.BOS_BUCKET || '',
        region: process.env.BOS_REGION || 'bj',
      },
    };

    // Initialize provider based on config
    if (this.config.type === 'bos' && this.config.bos?.accessKeyId) {
      console.log('📦 Using Baidu BOS storage');
      this.provider = new BOSStorageProvider(this.config.bos);
    } else {
      console.log('📁 Using local file storage');
      this.provider = new LocalStorageProvider(this.config.local);
    }
  }

  get storageType(): string {
    return this.config.type;
  }

  // Upload a file (from multer)
  async uploadMedia(file: Express.Multer.File): Promise<UploadResult> {
    const folder = this.getMediaFolder(file.mimetype);
    return this.provider.upload(file, folder);
  }

  // Upload thumbnail (base64 or buffer)
  async uploadThumbnail(base64Data: string, mediaId: string, index: number): Promise<UploadResult> {
    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const filename = `${mediaId}_${index.toString().padStart(5, '0')}.jpg`;
    
    return this.provider.uploadBuffer(buffer, filename, 'image/jpeg', 'thumbnails');
  }

  // Upload multiple thumbnails
  async uploadThumbnails(base64Array: string[], mediaId: string): Promise<string[]> {
    const urls: string[] = [];
    
    for (let i = 0; i < base64Array.length; i++) {
      try {
        const result = await this.uploadThumbnail(base64Array[i], mediaId, i);
        urls.push(result.url);
      } catch (error) {
        console.error(`Failed to upload thumbnail ${i}:`, error);
      }
    }
    
    return urls;
  }

  // Delete media and its thumbnails
  async deleteMedia(filename: string, mimetype: string): Promise<void> {
    const folder = this.getMediaFolder(mimetype);
    await this.provider.delete(filename, folder);
  }

  // Delete thumbnails for a media
  async deleteThumbnails(mediaId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const filename = `${mediaId}_${i.toString().padStart(5, '0')}.jpg`;
      try {
        await this.provider.delete(filename, 'thumbnails');
      } catch (error) {
        // Ignore errors for non-existent files
      }
    }
  }

  // Get URL for a file
  getUrl(filename: string, folder?: string): string {
    return this.provider.getUrl(filename, folder);
  }

  private getMediaFolder(mimetype: string): string {
    if (mimetype.startsWith('video/')) return 'videos';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('image/')) return 'images';
    return '';
  }
}

// Singleton instance
export const storage = new StorageService();

// ============================================
// Project State Persistence (T007)
// ============================================

import { Project, Timeline, Media, Transcript } from '../../../shared/types';

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.env.UPLOAD_DIR || './uploads', 'projects');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  console.log(`✓ Created projects directory: ${PROJECTS_DIR}`);
}

/**
 * Project storage service for local JSON persistence
 */
export class ProjectStorage {
  private projectsDir: string;

  constructor(projectsDir: string = PROJECTS_DIR) {
    this.projectsDir = projectsDir;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  private getProjectPath(projectId: string): string {
    return path.join(this.projectsDir, `${projectId}.json`);
  }

  /**
   * Create a new project
   */
  async create(data: Partial<Project>): Promise<Project> {
    const projectId = data.id || uuidv4();
    const now = new Date().toISOString();
    
    const project: Project = {
      id: projectId,
      name: data.name || 'Untitled Project',
      createdAt: now,
      updatedAt: now,
      ownerId: data.ownerId,
      media: data.media || [],
      transcript: data.transcript || null,
      timeline: data.timeline || this.createDefaultTimeline(projectId),
    };

    await this.save(project);
    return project;
  }

  /**
   * Get a project by ID
   */
  async get(projectId: string): Promise<Project | null> {
    const filePath = this.getProjectPath(projectId);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Project;
    } catch (error) {
      console.error(`Failed to read project ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Update a project
   */
  async update(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await this.get(projectId);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...updates,
      id: projectId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Delete a project
   */
  async delete(projectId: string): Promise<boolean> {
    const filePath = this.getProjectPath(projectId);
    
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      console.error(`Failed to delete project ${projectId}:`, error);
      return false;
    }
  }

  /**
   * List all projects
   */
  async list(): Promise<Project[]> {
    this.ensureDir();
    
    const files = fs.readdirSync(this.projectsDir)
      .filter(f => f.endsWith('.json'));

    const projects: Project[] = [];
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.projectsDir, file), 'utf-8');
        projects.push(JSON.parse(content) as Project);
      } catch (error) {
        console.error(`Failed to read project file ${file}:`, error);
      }
    }

    // Sort by updatedAt descending
    return projects.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Save a project to disk
   */
  private async save(project: Project): Promise<void> {
    const filePath = this.getProjectPath(project.id);
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
  }

  /**
   * Create a default empty timeline
   */
  private createDefaultTimeline(projectId: string): Timeline {
    return {
      id: uuidv4(),
      projectId,
      tracks: [
        {
          id: uuidv4(),
          type: 'video',
          name: 'Video 1',
          clips: [],
          muted: false,
          volume: 1,
          locked: false,
        },
        {
          id: uuidv4(),
          type: 'audio',
          name: 'Audio 1',
          clips: [],
          muted: false,
          volume: 1,
          locked: false,
        },
      ],
      duration: 0,
    };
  }

  /**
   * Add media to a project
   */
  async addMedia(projectId: string, media: Media): Promise<Project | null> {
    const project = await this.get(projectId);
    if (!project) return null;

    project.media.push(media);
    project.updatedAt = new Date().toISOString();

    // Update timeline duration if this media is longer
    if (media.duration && media.duration > project.timeline.duration) {
      project.timeline.duration = media.duration;
    }

    await this.save(project);
    return project;
  }

  /**
   * Update transcript for a project
   */
  async updateTranscript(projectId: string, transcript: Transcript): Promise<Project | null> {
    const project = await this.get(projectId);
    if (!project) return null;

    project.transcript = transcript;
    project.updatedAt = new Date().toISOString();

    await this.save(project);
    return project;
  }

  /**
   * Update timeline for a project
   */
  async updateTimeline(projectId: string, timeline: Timeline): Promise<Project | null> {
    const project = await this.get(projectId);
    if (!project) return null;

    project.timeline = timeline;
    project.updatedAt = new Date().toISOString();

    await this.save(project);
    return project;
  }
}

// Singleton instance
export const projectStorage = new ProjectStorage();
