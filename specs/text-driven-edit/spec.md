# Feature Specification: Text-driven Video Editing (Text-Driven Edit)

**Feature Branch**: `text-driven-edit`
**Created**: 2026-01-23
**Status**: Draft
**Input**: User description: "Implement text-driven video editing MVP: import video → automatic transcription → edit by transcript (select words/phrases to cut/split) → export basic video"

## User Scenarios & Testing (mandatory)

### User Story 1 - Import, Transcribe, Edit (Priority: P1)

As a user, I can upload a video, receive an automatic transcription with timestamps, and make edits by selecting words/phrases in the transcript to trim or split the video.

**Why this priority**: Core value of a Descript-like editor; enables basic text-driven editing workflow.

**Independent Test**: Upload a short video, wait for transcription, select a word range and perform a cut — resulting video playback reflects the edit.

**Acceptance Scenarios**:
1. Given a valid video file, when I upload it, then the backend returns a transcription with word-level timestamps within a reasonable time (for short files: < 2 minutes).
2. Given a transcription, when I highlight a phrase and choose "Cut", then the corresponding video segment is removed from playback and timeline.

---

### User Story 2 - Timeline Operations & Multi-track (Priority: P2)

As a user, I can view the video timeline, add tracks (audio/video/text), split clips at cursor, and rearrange clips on separate tracks.

**Why this priority**: Enables non-destructive editing and multi-track composition for richer edits.

**Independent Test**: Add a second audio track, split a clip at the playhead, and verify both clips can be moved independently.

**Acceptance Scenarios**:
1. Given a loaded project, when I press `S` or click Split at playhead, then the clip splits into two clips at that timestamp.
2. Given multiple tracks, when I drag a clip, then it snaps to the timeline grid and can be dropped on another track.

---

### User Story 3 - Export Basic Video (Priority: P3)

As a user, I can export the edited timeline to a new MP4 file (H.264/AAC) with a progress indicator.

**Why this priority**: Deliverable output for users; lower priority because it depends on edit UX.

**Independent Test**: Trigger export and verify a new MP4 file appears in `backend/uploads/exports/` and progress reaches 100%.

**Acceptance Scenarios**:
1. Given an edited timeline, when I click Export, then backend renders and stores the exported MP4 and returns a download link.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow video upload via `POST /api/media/upload` and return a file id and path.
- **FR-002**: System MUST transcribe uploaded media using the Groq Whisper API and store word-level timestamps.
- **FR-003**: Frontend MUST display transcript with selectable word ranges and map selections to timeline timestamps.
- **FR-004**: System MUST support split/cut operations that update the timeline state and persist project edits locally.
- **FR-005**: System MUST export timeline to MP4 via FFmpeg and provide progress updates.

### Key Entities

- **MediaFile**: id, filename, path, duration, mimeType
- **Transcript**: mediaId, words[{ text, start, end, confidence }]
- **Project**: id, mediaFiles[], tracks[], timelineClips[]

## Success Criteria (mandatory)

- **SC-001**: P1 flow (upload → transcribe → cut) demonstrable end-to-end in development environment.
- **SC-002**: Transcription contains word-level timestamps for >90% of spoken words on short test clips.
- **SC-003**: Exported MP4 is playable and contains edits made in the timeline.

## Non-Functional Requirements & Performance SLOs

- **NFR-001 (UI Responsiveness)**: Core timeline interactions (scrub, selection, split) respond with no perceptible lag to users (target: 60fps, <16ms frame interval for render updates).
- **NFR-002 (Partial Transcript Latency)**: For short clips (<=30s), the system SHOULD provide a first partial transcript/hypothesis within 5 seconds and surface interim/streaming hypotheses to the UI as they become available. Full transcription completion for short clips SHOULD complete within 2 minutes in the development environment.
- **NFR-003 (File Limits)**: The system MUST accept files up to 500MB in the MVP; larger files SHOULD be rejected with a clear error message.
- **NFR-004 (Error Handling)**: The system MUST provide clear error states for upload failures, transcription failures, and export failures, and permit the user to retry or cancel long-running jobs.

## Assumptions

- The constitution's Real-Time Performance principle applies primarily to UI-level feedback and optimistic updates; full ASR (automatic speech recognition) is expected to be asynchronous and run in background jobs with defined SLOs as above.
- Transcription accuracy targets (SC-002) are measured on short, reasonably clear speech clips with minimal background noise.

