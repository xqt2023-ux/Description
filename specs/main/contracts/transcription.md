# API Contracts: Transcription Endpoints

**Phase 1 Output** | **Date**: 2026-01-25

## POST /api/transcription/start

Start a transcription job for a media file.

### Request

**Content-Type**: `application/json`

```json
{
  "mediaId": "uuid",
  "language": "en"  // Optional: auto-detect if not provided
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mediaId` | `string` | ✓ | Media UUID to transcribe |
| `language` | `string` | | ISO 639-1 language code (e.g., "en", "es") |

### Response

**Success (202 Accepted)**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "mediaId": "uuid",
    "status": "pending",
    "progress": 0,
    "createdAt": "2026-01-25T12:00:00.000Z"
  }
}
```

**Error (404 Not Found)** - Media not found:
```json
{
  "success": false,
  "error": "MEDIA_NOT_FOUND",
  "message": "Media with ID 'uuid' not found"
}
```

**Error (409 Conflict)** - Already transcribing:
```json
{
  "success": false,
  "error": "TRANSCRIPTION_IN_PROGRESS",
  "message": "A transcription job is already in progress for this media"
}
```

---

## GET /api/transcription/:jobId/status

Get transcription job status (for polling).

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | `string` | ✓ | Transcription job UUID |

### Response

**Success (200 OK)** - Pending/Processing:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "mediaId": "uuid",
    "status": "processing",
    "progress": 45,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": null,
    "result": null,
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
    "mediaId": "uuid",
    "status": "completed",
    "progress": 100,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": "2026-01-25T12:01:30.000Z",
    "result": {
      "id": "uuid",
      "mediaId": "uuid",
      "language": "en",
      "segments": [
        {
          "id": "seg-1",
          "text": "Hello, this is a test.",
          "startTime": 0.0,
          "endTime": 2.5,
          "words": [
            { "text": "Hello,", "startTime": 0.0, "endTime": 0.5, "confidence": 0.98 },
            { "text": "this", "startTime": 0.6, "endTime": 0.8, "confidence": 0.99 },
            { "text": "is", "startTime": 0.9, "endTime": 1.0, "confidence": 0.99 },
            { "text": "a", "startTime": 1.1, "endTime": 1.2, "confidence": 0.97 },
            { "text": "test.", "startTime": 1.3, "endTime": 2.5, "confidence": 0.96 }
          ]
        }
      ],
      "createdAt": "2026-01-25T12:01:30.000Z",
      "updatedAt": "2026-01-25T12:01:30.000Z"
    },
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
    "mediaId": "uuid",
    "status": "failed",
    "progress": 0,
    "createdAt": "2026-01-25T12:00:00.000Z",
    "completedAt": "2026-01-25T12:00:05.000Z",
    "result": null,
    "error": "Transcription API rate limit exceeded. Please try again later."
  }
}
```

**Error (404 Not Found)**:
```json
{
  "success": false,
  "error": "JOB_NOT_FOUND",
  "message": "Transcription job with ID 'uuid' not found"
}
```

---

## POST /api/transcription/:jobId/retry

Retry a failed transcription job.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | `string` | ✓ | Transcription job UUID |

### Response

**Success (202 Accepted)**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "mediaId": "uuid",
    "status": "pending",
    "progress": 0,
    "createdAt": "2026-01-25T12:00:00.000Z"
  }
}
```

**Error (400 Bad Request)** - Job not failed:
```json
{
  "success": false,
  "error": "JOB_NOT_FAILED",
  "message": "Only failed jobs can be retried"
}
```

---

## DELETE /api/transcription/:jobId

Cancel a pending or processing transcription job.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | `string` | ✓ | Transcription job UUID |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "message": "Transcription job cancelled"
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
