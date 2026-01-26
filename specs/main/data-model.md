# Data Model: Text-driven Video Editing

**Phase 1 Output** | **Date**: 2026-01-25

## Entity Relationship Overview

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Project   │──────▶│    Media    │──────▶│  Transcript │
│             │  1:N  │             │  1:1  │             │
└─────────────┘       └─────────────┘       └─────────────┘
       │                                           │
       │ 1:1                                       │ 1:N
       ▼                                           ▼
┌─────────────┐                            ┌─────────────┐
│   Timeline  │                            │   Segment   │
│             │                            │             │
└─────────────┘                            └─────────────┘
       │                                           │
       │ 1:N                                       │ 1:N
       ▼                                           ▼
┌─────────────┐                            ┌─────────────┐
│    Track    │                            │    Word     │
│             │                            │             │
└─────────────┘                            └─────────────┘
       │
       │ 1:N
       ▼
┌─────────────┐
│    Clip     │
│             │
└─────────────┘
```

---

## Core Entities

### Project

The root entity representing a user's editing project.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `name` | `string` | ✓ | User-defined project name |
| `createdAt` | `string` (ISO 8601) | ✓ | Creation timestamp |
| `updatedAt` | `string` (ISO 8601) | ✓ | Last modification timestamp |
| `ownerId` | `string` | | User ID (for future multi-user) |
| `media` | `Media[]` | ✓ | Associated media files |
| `transcript` | `Transcript \| null` | ✓ | Primary transcript (if transcribed) |
| `timeline` | `Timeline` | ✓ | Timeline state with tracks and clips |

**State Transitions**:
- `created` → `media_added` → `transcribing` → `ready` → `exporting` → `ready`

---

### Media

Represents an uploaded media file (video, audio, or image).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `projectId` | `string` | ✓ | Foreign key to Project |
| `filename` | `string` | ✓ | Stored filename (sanitized) |
| `originalName` | `string` | ✓ | Original upload filename |
| `mimetype` | `string` | ✓ | MIME type (e.g., `video/mp4`) |
| `size` | `number` | ✓ | File size in bytes |
| `url` | `string` | ✓ | Relative URL path to file |
| `type` | `'video' \| 'audio' \| 'image'` | ✓ | Media type |
| `duration` | `number` | | Duration in seconds (for video/audio) |
| `metadata` | `MediaMetadata` | ✓ | Technical metadata |
| `createdAt` | `string` (ISO 8601) | ✓ | Upload timestamp |

**MediaMetadata**:

| Field | Type | Description |
|-------|------|-------------|
| `width` | `number` | Video width in pixels |
| `height` | `number` | Video height in pixels |
| `fps` | `number` | Frames per second |
| `codec` | `string` | Video codec (e.g., `h264`) |
| `bitrate` | `number` | Bitrate in bps |

**Validation Rules**:
- `size` ≤ 500MB (524,288,000 bytes) per NFR-003
- `mimetype` must be in allowed list: `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/wav`

---

### Transcript

Represents the transcription of a media file with word-level timestamps.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `mediaId` | `string` | ✓ | Foreign key to Media |
| `language` | `string` | ✓ | Detected/specified language code |
| `segments` | `TranscriptSegment[]` | ✓ | Transcript segments (sentences/phrases) |
| `createdAt` | `string` (ISO 8601) | ✓ | Transcription completion timestamp |
| `updatedAt` | `string` (ISO 8601) | ✓ | Last modification timestamp |

---

### TranscriptSegment

A segment of the transcript (typically a sentence or phrase).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `text` | `string` | ✓ | Full segment text |
| `startTime` | `number` | ✓ | Start time in seconds |
| `endTime` | `number` | ✓ | End time in seconds |
| `speakerId` | `string` | | Speaker identifier (future: diarization) |
| `words` | `Word[]` | ✓ | Individual words with timestamps |

---

### Word

Individual word with precise timing for text-driven editing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | ✓ | The word text |
| `startTime` | `number` | ✓ | Start time in seconds |
| `endTime` | `number` | ✓ | End time in seconds |
| `confidence` | `number` | ✓ | Confidence score (0.0-1.0) |

**Validation Rules**:
- `startTime` < `endTime`
- `confidence` ∈ [0.0, 1.0]
- `text` is non-empty

---

### Timeline

Represents the editing timeline with multiple tracks.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `projectId` | `string` | ✓ | Foreign key to Project |
| `tracks` | `Track[]` | ✓ | Ordered list of tracks |
| `duration` | `number` | ✓ | Total timeline duration in seconds |

---

### Track

A single track on the timeline (video, audio, or captions).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `type` | `'video' \| 'audio' \| 'caption'` | ✓ | Track type |
| `name` | `string` | ✓ | User-visible track name |
| `clips` | `Clip[]` | ✓ | Clips on this track |
| `muted` | `boolean` | | Whether track is muted |
| `volume` | `number` | | Track volume (0.0-1.0) |
| `locked` | `boolean` | | Whether track is locked for editing |

---

### Clip

A clip on a track, representing a portion of source media.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `mediaId` | `string` | ✓ | Foreign key to source Media |
| `name` | `string` | ✓ | User-visible clip name |
| `startTime` | `number` | ✓ | Position on timeline (seconds) |
| `duration` | `number` | ✓ | Clip duration on timeline (seconds) |
| `sourceStart` | `number` | ✓ | Start position in source media (seconds) |
| `sourceEnd` | `number` | ✓ | End position in source media (seconds) |
| `volume` | `number` | | Clip-specific volume (0.0-1.0) |
| `speed` | `number` | | Playback speed multiplier |
| `effects` | `ClipEffect[]` | | Applied effects |
| `thumbnails` | `string[]` | | Thumbnail URLs for timeline display |
| `waveform` | `number[]` | | Audio waveform data |

**Validation Rules**:
- `sourceStart` < `sourceEnd`
- `duration` = `(sourceEnd - sourceStart) / speed`
- `startTime` ≥ 0

---

## Job Entities

### TranscriptionJob

Tracks async transcription status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `mediaId` | `string` | ✓ | Foreign key to Media |
| `status` | `'pending' \| 'processing' \| 'completed' \| 'failed'` | ✓ | Job status |
| `language` | `string` | | Requested/detected language |
| `progress` | `number` | ✓ | Progress percentage (0-100) |
| `createdAt` | `string` (ISO 8601) | ✓ | Job creation timestamp |
| `completedAt` | `string \| null` | ✓ | Completion timestamp |
| `result` | `Transcript` | | Resulting transcript (when completed) |
| `error` | `string` | | Error message (when failed) |

---

### ExportJob

Tracks async video export status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✓ | UUID, primary key |
| `projectId` | `string` | ✓ | Foreign key to Project |
| `format` | `'mp4' \| 'webm' \| 'gif'` | ✓ | Output format |
| `resolution` | `'2160p' \| '1080p' \| '720p' \| '480p'` | ✓ | Output resolution |
| `quality` | `'high' \| 'medium' \| 'low'` | ✓ | Quality preset |
| `status` | `'pending' \| 'processing' \| 'completed' \| 'failed'` | ✓ | Job status |
| `progress` | `number` | ✓ | Progress percentage (0-100) |
| `createdAt` | `string` (ISO 8601) | ✓ | Job creation timestamp |
| `completedAt` | `string \| null` | ✓ | Completion timestamp |
| `outputUrl` | `string \| null` | ✓ | Download URL (when completed) |
| `error` | `string` | | Error message (when failed) |

---

## Storage Strategy (MVP)

### File Storage
- **Location**: `backend/uploads/`
- **Structure**:
  ```
  uploads/
  ├── videos/{mediaId}.{ext}
  ├── audio/{mediaId}.{ext}
  ├── thumbnails/{mediaId}/{index}.jpg
  └── exports/{exportJobId}.{format}
  ```

### Project State Storage
- **Format**: JSON files
- **Location**: `backend/uploads/projects/{projectId}.json`
- **Contains**: Full `Project` object with all nested entities

### Future Migration Path
- Replace JSON files with PostgreSQL
- Add Redis for job queue (BullMQ already in dependencies)
- Add S3/GCS for media storage
