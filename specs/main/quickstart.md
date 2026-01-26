# Quickstart Guide: Text-Driven Video Editor

**Phase 1 Output** | **Date**: 2026-01-25

## Prerequisites

- **Node.js** 18.x or later
- **FFmpeg** 6.0+ installed and in PATH
- **pnpm** (recommended) or npm
- **Groq API Key** (for transcription)

## Environment Setup

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd Description

# Install dependencies
pnpm install
```

### 2. Configure Environment Variables

Create `backend/.env`:

```env
# Server
PORT=3001
NODE_ENV=development

# Groq API (for Whisper transcription)
GROQ_API_KEY=your-groq-api-key

# Upload limits
MAX_FILE_SIZE=524288000  # 500MB
ALLOWED_FORMATS=mp4,webm,mov,avi,mkv,wav,mp3
```

Create `frontend/.env.local`:

```env
# API Base URL
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
pnpm dev

# Terminal 2: Frontend
cd frontend
pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Quick Demo Flow

### 1. Create a Project

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My First Project"}'
```

### 2. Upload Media

```bash
curl -X POST http://localhost:3001/api/media/upload \
  -F "file=@/path/to/video.mp4" \
  -F "projectId=<project-id>"
```

### 3. Start Transcription

```bash
curl -X POST http://localhost:3001/api/transcription/start \
  -H "Content-Type: application/json" \
  -d '{"mediaId": "<media-id>"}'
```

### 4. Check Transcription Status

```bash
curl http://localhost:3001/api/transcription/<job-id>/status
```

### 5. Open Editor

Navigate to: `http://localhost:3000/editor/<project-id>`

## Project Structure

```
Description/
├── backend/
│   ├── src/
│   │   ├── index.ts           # Express entry point
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic
│   │   └── middleware/        # Upload, error handling
│   └── uploads/               # Media storage (local)
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js App Router
│   │   ├── components/        # React components
│   │   ├── stores/            # Zustand state
│   │   └── lib/               # Utilities, API client
└── shared/
    └── types/                 # Shared TypeScript types
```

## Key Components

### Frontend

| Component | Path | Purpose |
|-----------|------|---------|
| EditorLayout | `components/editor/EditorLayout.tsx` | Main editor container |
| VideoPlayer | `components/editor/VideoPlayer.tsx` | Video playback with Slate integration |
| TranscriptEditor | `components/editor/TranscriptEditor.tsx` | Slate.js-based text editor |
| Timeline | `components/timeline/Timeline.tsx` | Visual timeline with tracks/clips |
| MediaLibrary | `components/editor/MediaLibrary.tsx` | Uploaded media panel |

### Backend

| Service | Path | Purpose |
|---------|------|---------|
| transcription | `services/transcription.ts` | Groq Whisper integration |
| videoProcessing | `services/videoProcessing.ts` | FFmpeg operations |
| storage | `services/storage.ts` | File management |
| claude | `services/claude.ts` | AI assistance (future) |

### State Management

```typescript
// stores/editorStore.ts
interface EditorState {
  project: Project | null;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  
  // Actions
  setProject: (project: Project) => void;
  seek: (time: number) => void;
  togglePlayback: () => void;
  deleteWord: (wordId: string) => void;
}
```

## Development Workflow

### Running Tests

```bash
# Frontend unit tests
cd frontend && pnpm test

# E2E tests (when implemented)
pnpm test:e2e
```

### Type Checking

```bash
# Check all packages
pnpm typecheck

# Or individually
cd frontend && pnpm typecheck
cd backend && pnpm typecheck
```

### Building for Production

```bash
# Build frontend
cd frontend && pnpm build

# Build backend
cd backend && pnpm build
```

## Common Issues

### FFmpeg Not Found

Ensure FFmpeg is installed and in PATH:
```bash
ffmpeg -version
```

### Groq API Rate Limits

The Groq free tier has rate limits. For production, use a paid API key.

### Large File Uploads

Increase timeout in nginx/proxy if using:
```nginx
client_max_body_size 500M;
proxy_read_timeout 300s;
```

## API Reference

See full API documentation in:
- [contracts/media.md](contracts/media.md)
- [contracts/transcription.md](contracts/transcription.md)
- [contracts/projects.md](contracts/projects.md)
- [contracts/export.md](contracts/export.md)
