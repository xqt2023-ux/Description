# Tasks: Text-driven Video Editing

**Input**: Design documents from `/specs/main/`
**Prerequisites**: spec.md (user stories), existing codebase structure

**Tests**: Not explicitly requested in spec - test tasks OMITTED per template guidance.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Includes exact file paths

## Path Conventions

- **Backend**: `backend/src/`
- **Frontend**: `frontend/src/`
- **Shared**: `shared/types/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing structure and fill gaps for MVP

- [X] T001 Verify FFmpeg is installed and accessible from backend in `backend/src/services/videoProcessing.ts`
- [X] T002 [P] Configure Groq API key environment variable in `backend/.env` and validate in `backend/src/index.ts`
- [X] T003 [P] Create exports directory structure at `backend/uploads/exports/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Extend shared types for transcript word-level timestamps in `shared/types/index.ts`
- [X] T005 [P] Implement error handling middleware with retry support in `backend/src/middleware/errorHandler.ts`
- [X] T005b Define job semantics (enqueue/status/retry/cancel) in `backend/src/services/jobs.ts` and `backend/src/routes/jobs.ts` — required for NFR-004 error handling; document in `contracts/jobs.md`
- [X] T006 [P] Add file size validation (500MB limit per NFR-003) in `backend/src/middleware/upload.ts`
- [X] T007 Create project state persistence service (local JSON storage) in `backend/src/services/storage.ts`
- [X] T007b [P] Create project CRUD routes (`GET/POST/PUT /api/projects`, `GET/PUT /api/projects/:id`) in `backend/src/routes/projects.ts` — uses storage service from T007
- [X] T008 Setup Zustand store for project/timeline state in `frontend/src/stores/editorStore.ts`
- [X] T008b [P] Create API contract test stubs for `/api/media`, `/api/transcription`, `/api/projects`, `/api/export` endpoints in `backend/tests/contracts/` — validate request/response shapes per Constitution IV (tests can be marked pending until endpoints implemented)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Import, Transcribe, Edit (Priority: P1) 🎯 MVP

**Goal**: User can upload video → receive transcription with word-level timestamps → select words to cut video

**Independent Test**: Upload a short video, wait for transcription, select a word range and perform a cut — resulting video playback reflects the edit.

### Backend Implementation for US1

- [X] T009 [US1] Implement Groq Whisper transcription service with word-level timestamps in `backend/src/services/transcription.ts`
- [X] T010 [US1] Add streaming/partial transcript support via Server-Sent Events (SSE) to transcription service in `backend/src/services/transcription.ts` — emit `transcript:partial` events with incremental `Word[]` as Groq returns chunks; see `contracts/transcription.md` for event schema
- [X] T011 [US1] Create `POST /api/transcription/start` endpoint with job status tracking in `backend/src/routes/transcription.ts`
- [X] T012 [US1] Create `GET /api/transcription/:id/status` endpoint for polling/streaming in `backend/src/routes/transcription.ts`
- [X] T013 [US1] Implement video upload with duration extraction in `backend/src/routes/media.ts`

### Frontend Implementation for US1

- [X] T014 [P] [US1] Create MediaUploader component with drag-drop and progress in `frontend/src/components/editor/MediaUploader.tsx`
- [X] T015 [US1] Create TranscriptEditor component with selectable word ranges in `frontend/src/components/editor/TranscriptEditor.tsx`
- [X] T016 [US1] Implement word selection → timeline timestamp mapping in `frontend/src/components/editor/TranscriptEditor.tsx`
- [X] T017 [US1] Add cut operation that updates timeline state from transcript selection in `frontend/src/stores/editorStore.ts`
- [X] T018 [US1] Connect VideoPlayer to timeline state for playback preview in `frontend/src/components/editor/VideoPlayer.tsx`
- [X] T019 [US1] Add transcription status polling and loading states in `frontend/src/components/editor/DescriptEditor.tsx`

### Integration for US1

- [X] T020 [US1] Wire upload → transcription → editor flow in `frontend/src/app/editor/[projectId]/page.tsx`
- [X] T021 [US1] Add error states with retry for upload/transcription failures per NFR-004 in `frontend/src/components/editor/DescriptEditor.tsx`

**Checkpoint**: User Story 1 (MVP) should be fully functional — upload, transcribe, cut via text

---

## Phase 4: User Story 2 - Timeline Operations & Multi-track (Priority: P2)

**Goal**: User can view timeline, add tracks, split clips at cursor, rearrange clips

**Independent Test**: Add a second audio track, split a clip at the playhead, verify both clips can be moved independently.

### Frontend Implementation for US2

- [X] T022 [P] [US2] Implement Timeline component with multi-track rendering in `frontend/src/components/timeline/Timeline.tsx`
- [X] T023 [US2] Add playhead cursor with keyboard shortcut (S) for split at position in `frontend/src/components/timeline/Timeline.tsx`
- [X] T024 [US2] Implement clip split operation in timeline store in `frontend/src/stores/editorStore.ts`
- [X] T025 [US2] Add drag-and-drop clip repositioning with track switching in `frontend/src/components/timeline/Timeline.tsx`
- [X] T026 [US2] Implement timeline grid snapping for clip placement in `frontend/src/components/timeline/Timeline.tsx`
- [X] T027 [US2] Add track management UI (add/remove/mute tracks) in `frontend/src/components/timeline/Timeline.tsx`
- [X] T028 [US2] Ensure 60fps rendering for timeline scrubbing (NFR-001) in `frontend/src/components/timeline/Timeline.tsx`

### Backend Support for US2

- [X] T029 [P] [US2] Add thumbnail generation endpoint for timeline clips in `backend/src/routes/media.ts`
- [X] T030 [P] [US2] Add waveform extraction endpoint for audio clips in `backend/src/routes/media.ts`

**Checkpoint**: User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Export Basic Video (Priority: P3)

**Goal**: User can export edited timeline to MP4 with progress indicator

**Independent Test**: Trigger export, verify MP4 appears in `backend/uploads/exports/` and progress reaches 100%.

### Backend Implementation for US3

- [X] T031 [US3] Implement FFmpeg export pipeline with progress tracking in `backend/src/services/videoProcessing.ts`
- [X] T032 [US3] Create `POST /api/export/start` endpoint with job creation in `backend/src/routes/export.ts`
- [X] T033 [US3] Create `GET /api/export/:id/status` endpoint for progress polling in `backend/src/routes/export.ts`
- [X] T034 [US3] Create `GET /api/export/:id/download` endpoint for completed exports in `backend/src/routes/export.ts`

### Frontend Implementation for US3

- [X] T035 [P] [US3] Create ExportDialog component with format/quality options in `frontend/src/components/editor/ExportDialog.tsx`
- [X] T036 [US3] Add export progress indicator with cancel support in `frontend/src/components/editor/ExportDialog.tsx`
- [X] T037 [US3] Implement export job polling and download trigger in `frontend/src/components/editor/ExportDialog.tsx`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T038 [P] Add auto-save for project state (30s max data loss per Constitution V) in `frontend/src/stores/editorStore.ts`
- [X] T039 [P] Add keyboard shortcuts documentation in `frontend/src/components/editor/Toolbar.tsx`
- [X] T040 Performance audit for timeline rendering (ensure <16ms frame time) in `frontend/src/components/timeline/Timeline.tsx`
- [X] T041 Add loading skeletons for transcript and timeline in `frontend/src/components/editor/LoadingSkeletons.tsx`
- [X] T042 Verify end-to-end flow for SC-001: upload → transcribe → cut demonstrable

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (P1) → US2 (P2) → US3 (P3) in priority order
  - US2 can start in parallel with US1 if staffed
  - US3 depends on timeline state from US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - Enhances US1 but independently testable
- **User Story 3 (P3)**: Requires timeline state from US1/US2 for meaningful export

### Within Each User Story

- Backend before frontend (APIs must exist)
- Models/types before services
- Services before endpoints
- Core implementation before integration

### Parallel Opportunities

- T002, T003 can run in parallel (Setup)
- T005, T006 can run in parallel (Foundational)
- T014 can run parallel with T009-T013 (different codebases)
- T022 can run parallel with backend tasks
- T029, T030 can run in parallel (independent endpoints)
- T035 can run parallel with T031-T034 (different codebases)
- T038, T039 can run in parallel (different files)

---

## Parallel Example: User Story 1

```text
# Backend tasks (sequential within):
T009 → T010 → T011 → T012 → T013

# Frontend tasks (can start T014 immediately, others after backend):
T014 (parallel with backend)
T015 → T016 → T017 → T018 → T019

# Integration (after both):
T020 → T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008)
3. Complete Phase 3: User Story 1 (T009-T021)
4. **STOP and VALIDATE**: SC-001 - upload → transcribe → cut flow works end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. User Story 1 → Test independently → **MVP Demo!**
3. User Story 2 → Test independently → Enhanced editing
4. User Story 3 → Test independently → Full export capability
5. Polish → Production-ready

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | 52 |
| **Setup (Phase 1)** | 3 |
| **Foundational (Phase 2)** | 5 |
| **US1 - Import/Transcribe/Edit (P1)** | 13 |
| **US2 - Timeline Operations (P2)** | 9 |
| **US3 - Export Video (P3)** | 7 |
| **Polish (Phase 6)** | 5 |
| **Testing & Documentation** | 6 |
| **Additional Tasks** | 4 |
| **Parallel Opportunities** | 12 tasks marked [P] |

### Independent Test Criteria

| Story | Test |
|-------|------|
| US1 | Upload video → transcription appears → select words → cut → playback reflects edit |
| US2 | Add track → split clip at playhead → move clips independently |
| US3 | Click Export → progress shows → MP4 downloads |

### Suggested MVP Scope

**User Story 1 only** (T001-T021) = core text-driven editing workflow

## Final Phase: Testing & Documentation

- [ ] T043 Add Vitest unit tests for `frontend/src/lib/utils.ts` and `backend/src/services/transcription.ts` (`frontend/__tests__`, `backend/tests`)
- [ ] T044 Add Playwright E2E tests for upload→transcribe→cut→playback flow in `frontend/e2e/`
- [ ] T045 Add contract/unit tests to validate `shared/types` serialization and API request/response shapes
- [ ] T046 Add CI job config (GitHub Actions) to run `npx tsc --noEmit`, `npm run lint`, `npx vitest` and optionally Playwright smoke tests
- [ ] T047 Update `README.md` and `specs/main/quickstart.md` with developer steps and P1 demo script
- [ ] T048 Add monitoring/logging guidelines for media jobs (structured logs, error codes)

# Additional Tasks (Validation & Job Semantics)

- [ ] T049 Add transcript accuracy test harness and sample corpus in `specs/main/tests/accuracy/` to validate SC-002 (automated script and sample audio files)
- [ ] T050 [MOVED to T005b] Job semantics now in Phase 2 Foundational
- [ ] T051 [US1] Add streaming transcript UI with SSE handling in `frontend/src/components/editor/TranscriptEditor.tsx` (per NFR-002)
- [ ] T052 Add SC-002 validation task: measure transcription accuracy on sample corpus (target: >90% word-level coverage)



## Dependencies

- 核心顺序: Phase1 → Phase2 → Phase3 (US1) → Phase4 (US2) → Phase5 (US3) → Phase6 (Polish) → Final (Testing)

## Parallel Execution Examples

- `T022` (Timeline UI) and `T029` (thumbnail generation) can run in parallel
- `T014` (MediaUploader) and `T009-T013` (backend) are parallelizable for frontend/backend workstreams

## Implementation Strategy

- MVP scope: Complete Phase 3 (US1) minimal implementation — upload, asynchronous transcription, transcript selection → cut that updates timeline state and persists edits. Use local storage and simple job runner for dev.

