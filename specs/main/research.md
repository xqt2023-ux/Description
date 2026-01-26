# Research: Text-driven Video Editing

**Phase 0 Output** | **Date**: 2026-01-25

## Research Tasks

This document resolves all "NEEDS CLARIFICATION" items from the Technical Context and documents key decisions.

---

### 1. Transcription API: Groq Whisper Integration

**Question**: Best approach for word-level timestamps and streaming partial results?

**Research Findings**:
- Groq Whisper API (`whisper-large-v3`) already implemented in `backend/src/services/transcription.ts`
- Supports `timestamp_granularities: ['word', 'segment']` for word-level timestamps
- Returns `verbose_json` format with word-level timing data
- No native streaming; must poll or use SSE for progress

**Decision**: Use existing Groq integration with polling endpoint
**Rationale**: Already implemented and working; Groq is free and fast
**Alternatives Considered**: 
- OpenAI Whisper (slower, costs money)
- Local Whisper (requires GPU, complex setup)

---

### 2. Streaming Partial Transcripts (NFR-002)

**Question**: How to surface partial transcript within 5 seconds?

**Research Findings**:
- Groq API does not support true streaming for transcription
- Options: (a) chunk audio and transcribe in parallel, (b) show progress only, (c) use SSE for status updates

**Decision**: Implement job-based polling with SSE for status updates
**Rationale**: Simpler than audio chunking; meets "surface interim hypotheses" requirement via status updates
**Implementation**:
```typescript
// Backend: POST /api/transcription/start -> returns jobId
// Backend: GET /api/transcription/:jobId/status -> returns { status, progress, partialText? }
// Frontend: Poll every 1s or use SSE for real-time status
```

---

### 3. Timeline State Management

**Question**: How to manage complex timeline state with undo/redo?

**Research Findings**:
- Zustand already in use (`frontend/src/stores/editorStore.ts`)
- Constitution requires optimistic updates + auto-save
- Options: (a) Zustand with immer, (b) Zustand with temporal middleware, (c) Custom undo stack

**Decision**: Zustand with immer for immutable updates + manual undo stack
**Rationale**: 
- Immer provides immutable updates without boilerplate
- Manual undo stack gives control over what's undoable
- Zustand persist middleware handles auto-save

**Implementation**:
```typescript
// editorStore.ts
interface EditorState {
  project: Project;
  undoStack: ProjectSnapshot[];
  redoStack: ProjectSnapshot[];
  // actions
  cut: (startTime: number, endTime: number) => void;
  split: (trackId: string, clipId: string, time: number) => void;
  undo: () => void;
  redo: () => void;
}
```

---

### 4. Video Playback with Timeline Edits

**Question**: How to preview edits without re-encoding?

**Research Findings**:
- HTML5 video element supports `currentTime` seeking
- For cuts: skip segments during playback by tracking "excluded ranges"
- For multi-track: would need Web Audio API for audio mixing
- Options: (a) Virtual playback with skip logic, (b) MediaSource Extensions, (c) Server-side preview rendering

**Decision**: Virtual playback with client-side skip logic (MVP)
**Rationale**: Simplest approach; avoids re-encoding; sufficient for MVP
**Limitations**: No true multi-track audio mixing in MVP; single video track playback

**Implementation**:
```typescript
// VideoPlayer skips excluded ranges
function getPlayableRanges(clips: Clip[]): TimeRange[] {
  // Convert clips to playable ranges, excluding cut segments
}

// On timeupdate, check if currentTime is in excluded range and skip
```

---

### 5. Export Pipeline (FFmpeg)

**Question**: How to implement export with progress tracking?

**Research Findings**:
- FFmpeg progress via `-progress` flag or stderr parsing
- fluent-ffmpeg has `progress` event
- Existing implementation in `videoProcessing.ts` supports progress callback

**Decision**: Use existing FFmpeg wrapper with progress events
**Rationale**: Already implemented; fluent-ffmpeg handles progress parsing

**Implementation**:
```typescript
// Export with edit list (cuts)
// 1. Generate FFmpeg filter_complex for cuts
// 2. Stream progress to frontend via SSE or polling
// 3. Store output in backend/uploads/exports/
```

---

### 6. File Size Validation (NFR-003)

**Question**: Where to validate 500MB limit?

**Research Findings**:
- Multer middleware handles file uploads
- Can set `limits.fileSize` in multer config
- Should also validate on frontend before upload starts

**Decision**: Validate in both frontend (pre-upload) and backend (multer)
**Rationale**: Better UX to reject early; backend validation for security

**Implementation**:
```typescript
// backend/src/middleware/upload.ts
const upload = multer({
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  // ...
});

// frontend: check file.size before FormData submission
```

---

### 7. Error Handling & Retry (NFR-004)

**Question**: How to implement retry for transcription failures?

**Research Findings**:
- Transcription can fail due to: API rate limits, network issues, invalid audio
- Constitution V requires clear error states with retry options

**Decision**: Exponential backoff with 3 retries, then surface error with manual retry button
**Rationale**: Balances automatic recovery with user control

**Implementation**:
```typescript
// Backend: Retry logic in transcription service
async function transcribeWithRetry(filePath: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await transcribeAudioWithGroq(filePath);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}

// Frontend: Show error state with "Retry" button
```

---

### 8. Word Selection → Timeline Mapping

**Question**: How to map transcript word selection to timeline cuts?

**Research Findings**:
- Words have `startTime` and `endTime` in transcript
- Timeline clips have `sourceStart` and `sourceEnd`
- Selection = contiguous word range

**Decision**: Direct mapping via word timestamps
**Rationale**: Word timestamps directly correspond to source media time

**Implementation**:
```typescript
// TranscriptEditor: onWordRangeSelect
function handleCut(selectedWords: Word[]) {
  const startTime = selectedWords[0].startTime;
  const endTime = selectedWords[selectedWords.length - 1].endTime;
  editorStore.cut(startTime, endTime);
}
```

---

## Summary of Decisions

| Topic | Decision | Key Reason |
|-------|----------|------------|
| Transcription API | Groq Whisper (existing) | Free, fast, already implemented |
| Partial Transcript | Job polling + SSE status | Simpler than audio chunking |
| State Management | Zustand + immer + manual undo | Control over undo granularity |
| Playback Preview | Client-side skip logic | No re-encoding needed for MVP |
| Export Progress | FFmpeg progress event | Already implemented |
| File Validation | Frontend + backend (multer) | UX + security |
| Error Retry | 3x exponential backoff | Balance auto-recovery + user control |
| Word → Timeline | Direct timestamp mapping | Words have exact source times |

---

## Open Questions (Deferred to Implementation)

1. **Multi-track audio mixing**: Deferred post-MVP; single video track for now
2. **Collaborative editing**: Out of scope for MVP
3. **Cloud storage**: Using local filesystem for MVP; can add S3/GCS later
