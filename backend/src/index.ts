import dotenv from 'dotenv';
dotenv.config();

// Bootstrap global proxy agent BEFORE any imports that make HTTP requests
import { bootstrap } from 'global-agent';

// Enable global proxy if HTTPS_PROXY or HTTP_PROXY is set
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  process.env.GLOBAL_AGENT_HTTP_PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

  // Set NO_PROXY for global-agent
  if (process.env.NO_PROXY) {
    process.env.GLOBAL_AGENT_NO_PROXY = process.env.NO_PROXY;
  }

  bootstrap();
  console.log('🌐 Global proxy enabled:', process.env.GLOBAL_AGENT_HTTP_PROXY);
  if (process.env.NO_PROXY) {
    console.log('🚫 Proxy bypass list:', process.env.NO_PROXY);
  }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { projectRoutes } from './routes/projects';
import { mediaRoutes } from './routes/media';
import { transcriptionRoutes } from './routes/transcription';
import { exportRoutes } from './routes/export';
import { aiRoutes } from './routes/ai';
import { jobRoutes } from './routes/jobs';
import { verifyFFmpeg } from './services/videoProcessing';
import { initializeTools } from './mcp-server/registry/initTools';

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// ============================================
// Startup Verification (T001, T002, T003)
// ============================================

// Initialize MCP Tools Registry
console.log('🔧 Initializing MCP Tools...');
try {
  initializeTools();
  console.log('✓ MCP Tools initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize MCP tools:', (error as Error).message);
}

// T001: Verify FFmpeg is installed
try {
  verifyFFmpeg();
} catch (error) {
  console.error('❌ FFmpeg verification failed:', (error as Error).message);
  console.error('   Please install FFmpeg: https://ffmpeg.org/download.html');
}

// T002: Validate Groq API key
if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY not set. Transcription service will not work.');
  console.warn('   Get a free API key at: https://console.groq.com');
} else {
  console.log('✓ Groq API key configured');
}

// T003: Ensure exports directory exists
const EXPORTS_DIR = path.resolve(UPLOAD_DIR, 'exports');
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  console.log(`✓ Created exports directory: ${EXPORTS_DIR}`);
} else {
  console.log(`✓ Exports directory exists: ${EXPORTS_DIR}`);
}

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow loading files from different origins
  crossOriginEmbedderPolicy: false, // Disable to allow video thumbnails
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    // In development, allow all localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }

    // In production, only allow configured frontend URL
    const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (origin === allowedOrigin) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 thumbnails
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads with CORS headers for video thumbnails
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  next();
}, express.static(path.resolve(UPLOAD_DIR)));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/transcriptions', transcriptionRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/jobs', jobRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
