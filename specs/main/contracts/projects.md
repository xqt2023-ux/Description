# API Contracts: Project Endpoints

**Phase 1 Output** | **Date**: 2026-01-25

## POST /api/projects

Create a new project.

### Request

**Content-Type**: `application/json`

```json
{
  "name": "My Video Project"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✓ | Project name (3-100 characters) |

### Response

**Success (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Video Project",
    "createdAt": "2026-01-25T12:00:00.000Z",
    "updatedAt": "2026-01-25T12:00:00.000Z",
    "media": [],
    "timeline": {
      "id": "uuid",
      "duration": 0,
      "tracks": []
    },
    "transcript": null
  }
}
```

**Error (400 Bad Request)** - Validation failed:
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Project name must be between 3 and 100 characters"
}
```

---

## GET /api/projects

List all projects.

### Request

**Query Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | `number` | | Max results (default: 20, max: 100) |
| `offset` | `number` | | Pagination offset (default: 0) |
| `sort` | `'updatedAt' \| 'createdAt' \| 'name'` | | Sort field (default: updatedAt) |
| `order` | `'asc' \| 'desc'` | | Sort order (default: desc) |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "uuid",
        "name": "My Video Project",
        "createdAt": "2026-01-25T12:00:00.000Z",
        "updatedAt": "2026-01-25T14:30:00.000Z",
        "mediaThumbnail": "/api/media/uuid/thumbnails/0",
        "duration": 125.5
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

## GET /api/projects/:projectId

Get a single project with full details.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | `string` | ✓ | Project UUID |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Video Project",
    "createdAt": "2026-01-25T12:00:00.000Z",
    "updatedAt": "2026-01-25T14:30:00.000Z",
    "media": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "filename": "interview.mp4",
        "type": "video",
        "duration": 125.5,
        "path": "/uploads/videos/uuid-interview.mp4",
        "thumbnailPath": "/uploads/thumbnails/uuid-interview.jpg",
        "waveformPath": "/uploads/waveforms/uuid-interview.json",
        "metadata": {
          "width": 1920,
          "height": 1080,
          "fps": 30,
          "codec": "h264",
          "audioChannels": 2,
          "sampleRate": 48000
        },
        "createdAt": "2026-01-25T12:05:00.000Z"
      }
    ],
    "timeline": {
      "id": "uuid",
      "duration": 125.5,
      "tracks": [
        {
          "id": "uuid",
          "type": "video",
          "clips": [
            {
              "id": "uuid",
              "mediaId": "uuid",
              "startTime": 0,
              "endTime": 125.5,
              "mediaStartTime": 0,
              "mediaEndTime": 125.5,
              "trackId": "uuid"
            }
          ]
        }
      ]
    },
    "transcript": {
      "id": "uuid",
      "mediaId": "uuid",
      "language": "en",
      "status": "completed",
      "segments": [
        {
          "id": "uuid",
          "startTime": 0.5,
          "endTime": 3.2,
          "text": "Hello and welcome to this video",
          "words": [
            { "word": "Hello", "startTime": 0.5, "endTime": 0.8, "confidence": 0.98, "deleted": false },
            { "word": "and", "startTime": 0.85, "endTime": 1.0, "confidence": 0.99, "deleted": false },
            { "word": "welcome", "startTime": 1.05, "endTime": 1.5, "confidence": 0.97, "deleted": false },
            { "word": "to", "startTime": 1.55, "endTime": 1.7, "confidence": 0.99, "deleted": false },
            { "word": "this", "startTime": 1.75, "endTime": 2.0, "confidence": 0.98, "deleted": false },
            { "word": "video", "startTime": 2.05, "endTime": 3.2, "confidence": 0.96, "deleted": false }
          ]
        }
      ],
      "createdAt": "2026-01-25T12:10:00.000Z"
    }
  }
}
```

**Error (404 Not Found)**:
```json
{
  "success": false,
  "error": "PROJECT_NOT_FOUND",
  "message": "Project with ID 'uuid' not found"
}
```

---

## PATCH /api/projects/:projectId

Update project details (name, timeline, transcript edits).

### Request

**Content-Type**: `application/json`

```json
{
  "name": "Updated Project Name",
  "timeline": {
    "tracks": [...]
  },
  "transcript": {
    "segments": [...]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | | Updated project name |
| `timeline` | `Timeline` | | Full timeline object (replaces existing) |
| `transcript` | `Transcript` | | Full transcript object (for edit sync) |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Project Name",
    "createdAt": "2026-01-25T12:00:00.000Z",
    "updatedAt": "2026-01-25T15:00:00.000Z",
    ...
  }
}
```

---

## DELETE /api/projects/:projectId

Delete a project and all associated media.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | `string` | ✓ | Project UUID |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**Error (404 Not Found)**:
```json
{
  "success": false,
  "error": "PROJECT_NOT_FOUND",
  "message": "Project with ID 'uuid' not found"
}
```

---

## POST /api/projects/:projectId/auto-save

Trigger auto-save for a project (debounced client-side).

### Request

**Content-Type**: `application/json`

```json
{
  "timeline": { ... },
  "transcript": { ... }
}
```

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "savedAt": "2026-01-25T15:00:00.000Z"
  }
}
```
