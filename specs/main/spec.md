# Feature Specification: Text-driven Video Editing (Text-Driven Edit)

**Feature Branch**: `main`
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

As a user, I can view the video timeline, add tracks (audio/video), split clips at cursor, and rearrange clips on separate tracks.

> **Note**: Text/caption tracks are deferred to post-MVP scope.

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

### User Story 4 - AI-Driven Video Editing via Natural Language (Priority: P4)

As a user, I can describe video editing operations in natural language (e.g., "delete the first 5 seconds", "remove filler words") and have the AI parse my intent, generate an edit plan, and execute the edits automatically.

**Why this priority**: Extends the core editing workflow with AI assistance; builds on top of US1-US3 infrastructure.

**Independent Test**: Type "删除前5秒" in the AI chat → AI parses intent → generates FFmpeg command → executes and returns edited video.

**Acceptance Scenarios**:
1. Given a loaded video, when I type "trim the first 10 seconds", then the AI generates an edit plan with a cut operation from 0s to 10s.
2. Given an edit plan, when I confirm execution, then FFmpeg processes the video and I can download the result.
3. Given a completed edit, when I click Undo, then the previous version is restored.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow video upload via `POST /api/media` and return a file id and path.
- **FR-002**: System MUST transcribe uploaded media using the Groq Whisper API and store word-level timestamps.
- **FR-003**: Frontend MUST display transcript with selectable word ranges and map selections to timeline timestamps.
- **FR-004**: System MUST support split/cut operations that update the timeline state and persist project edits locally.
- **FR-005**: System MUST export timeline to MP4 via FFmpeg and provide progress updates.
- **FR-006**: System MUST provide an AI chat endpoint (`POST /api/ai/chat`) that accepts natural language and returns contextual responses.
- **FR-007**: System MUST parse user edit requests into structured `EditPlan` objects with specific FFmpeg instructions.
- **FR-008**: System MUST execute edit plans via FFmpeg and track progress with undo/redo support.
- **FR-009**: System MUST provide AI skills for transcript processing (filler word removal, summary, translation, chapter generation).

### Key Entities

- **Media**: id, filename, path, duration, mimeType
- **Transcript**: mediaId, words[{ text, start, end, confidence }]
- **Project**: id, media[], tracks[], clips[]
- **EditPlan**: id, mediaId, userRequest, instructions[], status, estimatedDuration
- **EditInstruction**: type (cut/trim/add_text/speed_change), params, startTime, endTime, description
- **EditHistory**: mediaId, currentVersion, history[], canUndo, canRedo

## Success Criteria (mandatory)

- **SC-001**: P1 flow (upload → transcribe → cut) demonstrable end-to-end in development environment.
- **SC-002**: Transcription contains word-level timestamps for >90% of spoken words on short test clips.
- **SC-003**: Exported MP4 is playable and contains edits made in the timeline.
- **SC-004**: AI can parse common edit intents (cut, trim, speed change) with >80% accuracy on test phrases.
- **SC-005**: Edit undo/redo restores previous video state correctly.

## Non-Functional Requirements & Performance SLOs

- **NFR-001 (UI Responsiveness)**: Core timeline interactions (scrub, selection, split) respond with no perceptible lag to users (target: 60fps, <16ms frame interval for render updates).
- **NFR-002 (Partial Transcript Latency)**: For short clips (<=60s), the system SHOULD provide a first partial transcript/hypothesis within 5 seconds and surface interim/streaming hypotheses to the UI as they become available. Full transcription completion for short clips SHOULD complete within 2 minutes in the development environment.
- **NFR-003 (File Limits)**: The system MUST accept files up to 500MB in the MVP; larger files SHOULD be rejected with a clear error message.
- **NFR-004 (Error Handling)**: The system MUST provide clear error states for upload failures, transcription failures, and export failures, and permit the user to retry or cancel long-running jobs.

## Assumptions

- The constitution's Real-Time Performance principle applies primarily to UI-level feedback and optimistic updates; full ASR (automatic speech recognition) is expected to be asynchronous and run in background jobs with defined SLOs as above.
- Transcription accuracy targets (SC-002) are measured on short, reasonably clear speech clips with minimal background noise.

