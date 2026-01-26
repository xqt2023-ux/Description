# API Contracts: Export Endpoints

**Phase 1 Output** | **Date**: 2026-01-25

## POST /api/export/start

Start an export job for a project.

### Request

**Content-Type**: `application/json`

```json
{
  "projectId": "uuid",
  "options": {
    "format": "mp4",
    "resolution": "1080p",
    "quality": "high",
    "includeSubtitles": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | `string` | ✓ | Project UUID to export |
| `options.format` | `'mp4' \| 'webm' \| 'gif'` | ✓ | Output format |
| `options.resolution` | `'2160p' \| '1080p' \| '720p' \| '480p'` | ✓ | Output resolution |
| `options.quality` | `'high' \| 'medium' \| 'low'` | ✓ | Quality preset |
| `options.includeSubtitles` | `boolean` | | Include burned-in subtitles |
| `options.subtitleStyle` | `SubtitleStyle` | | Subtitle styling (if includeSubtitles) |

### Response

**Success (202 Accepted)**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "projectId": "uuid",
    "format": "mp4",
    "resolution": "1080p",
    "quality": "high",
    "status": "pending",
    "progress": 0,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": null,
    "outputUrl": null,
    "error": null
  }
}
```

**Error (404 Not Found)** - Project not found:
```json
{
  "success": false,
  "error": "PROJECT_NOT_FOUND",
  "message": "Project with ID 'uuid' not found"
}
```

**Error (400 Bad Request)** - Empty timeline:
```json
{
  "success": false,
  "error": "EMPTY_TIMELINE",
  "message": "Cannot export a project with no clips on the timeline"
}
```

---

## GET /api/export/:jobId/status

Get export job status (for polling).

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | `string` | ✓ | Export job UUID |

### Response

**Success (200 OK)** - Processing:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "projectId": "uuid",
    "format": "mp4",
    "resolution": "1080p",
    "quality": "high",
    "status": "processing",
    "progress": 45,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": null,
    "outputUrl": null,
    "error": null
  }
}
```

**Success (200 OK)** - Completed:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "projectId": "uuid",
    "format": "mp4",
    "resolution": "1080p",
    "quality": "high",
    "status": "completed",
    "progress": 100,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": "2026-01-25T12:05:30.000Z",
    "outputUrl": "/api/export/uuid/download",
    "error": null
  }
}
```

**Success (200 OK)** - Failed:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "projectId": "uuid",
    "format": "mp4",
    "resolution": "1080p",
    "quality": "high",
    "status": "failed",
    "progress": 30,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": "2026-01-25T12:02:00.000Z",
    "outputUrl": null,
    "error": "FFmpeg encoding failed: Unsupported codec in source media"
  }
}
```

---

## GET /api/export/:jobId/download

Download the exported file.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | `string` | ✓ | Export job UUID |

### Response

**Success (200 OK)**:
- **Content-Type**: `video/mp4` (or `video/webm`, `image/gif`)
- **Content-Disposition**: `attachment; filename="project-name.mp4"`
- Body: Binary file data

**Error (404 Not Found)** - Job not found or not completed:
```json
{
  "success": false,
  "error": "EXPORT_NOT_READY",
  "message": "Export job not found or not yet completed"
}
```

---

## DELETE /api/export/:jobId

Cancel a pending or processing export job.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | `string` | ✓ | Export job UUID |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "message": "Export job cancelled"
}
```

**Error (400 Bad Request)** - Job already completed:
```json
{
  "success": false,
  "error": "JOB_ALREADY_COMPLETED",
  "message": "Cannot cancel a completed job"
}
```
