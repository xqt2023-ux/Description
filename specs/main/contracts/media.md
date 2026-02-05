# API Contracts: Media Endpoints

**Phase 1 Output** | **Date**: 2026-01-25

## POST /api/media

Upload a media file to the project.

> **Note**: The endpoint path is `/api/media` (not `/api/media/upload`). The upload action is implied by the POST method.

### Request

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | `File` | ✓ | Media file (video/audio) |
| `projectId` | `string` | ✓ | Project to add media to |

**Constraints**:
- Max file size: 500MB
- Allowed MIME types: `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/wav`

### Response

**Success (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "filename": "abc123.mp4",
    "originalName": "my-video.mp4",
    "mimetype": "video/mp4",
    "size": 52428800,
    "url": "/uploads/videos/abc123.mp4",
    "type": "video",
    "duration": 120.5,
    "metadata": {
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "codec": "h264",
      "bitrate": 5000000
    },
    "createdAt": "2026-01-25T12:00:00.000Z"
  }
}
```

**Error (400 Bad Request)** - File too large:
```json
{
  "success": false,
  "error": "FILE_TOO_LARGE",
  "message": "File size exceeds 500MB limit"
}
```

**Error (400 Bad Request)** - Invalid file type:
```json
{
  "success": false,
  "error": "INVALID_FILE_TYPE",
  "message": "File type not supported. Allowed: video/mp4, video/webm, video/quicktime, audio/mpeg, audio/wav"
}
```

---

## GET /api/media/:mediaId

Get media file details.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mediaId` | `string` | ✓ | Media UUID |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "filename": "abc123.mp4",
    "originalName": "my-video.mp4",
    "mimetype": "video/mp4",
    "size": 52428800,
    "url": "/uploads/videos/abc123.mp4",
    "type": "video",
    "duration": 120.5,
    "metadata": {
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "codec": "h264",
      "bitrate": 5000000
    },
    "createdAt": "2026-01-25T12:00:00.000Z"
  }
}
```

**Error (404 Not Found)**:
```json
{
  "success": false,
  "error": "MEDIA_NOT_FOUND",
  "message": "Media with ID 'uuid' not found"
}
```

---

## GET /api/media/:mediaId/thumbnails

Get thumbnail images for timeline display.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mediaId` | `string` | ✓ | Media UUID |

**Query Parameters**:
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `count` | `number` | 10 | Number of thumbnails to generate |
| `width` | `number` | 160 | Thumbnail width in pixels |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "mediaId": "uuid",
    "thumbnails": [
      "/uploads/thumbnails/uuid/0.jpg",
      "/uploads/thumbnails/uuid/1.jpg",
      "/uploads/thumbnails/uuid/2.jpg"
    ]
  }
}
```

---

## GET /api/media/:mediaId/waveform

Get audio waveform data for timeline display.

### Request

**Path Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mediaId` | `string` | ✓ | Media UUID |

**Query Parameters**:
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `samples` | `number` | 1000 | Number of waveform samples |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "data": {
    "mediaId": "uuid",
    "waveform": [0.1, 0.3, 0.8, 0.5, ...],
    "duration": 120.5
  }
}
```
