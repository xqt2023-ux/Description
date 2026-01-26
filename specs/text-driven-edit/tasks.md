---
description: "Tasks for Text-driven Video Editing feature"
---

# Tasks: Text-driven Video Editing

**Input**: Design documents from `/specs/text-driven-edit/`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Install and configure Vitest in frontend (`frontend/package.json` and `frontend/vitest.config.ts`)
- [ ] T002 Add Playwright scaffolding for E2E in `frontend/e2e/` (minimal config)
- [ ] T003 Ensure `frontend/tsconfig.json` and `backend/tsconfig.json` enable `strict` and consistent compilerOptions
- [ ] T004 Add shared types entry file `shared/types/index.ts` with placeholders for `MediaFile`, `Transcript`, `Project`
- [ ] T005 Create runtime storage directories `backend/uploads/`, `backend/uploads/transcripts/`, `backend/uploads/exports/` (ensure gitignore)
- [ ] T006 Add lint/prettier configs if missing (`.eslintrc`, `.prettierrc`) in repo root

## Phase 2: Foundational (blocking prerequisites)

- [ ] T007 Implement media upload route `backend/src/routes/media.ts` (FR-001) — accepts multipart/form-data, validates file type/size, stores under `backend/uploads/originals/`, returns `MediaFile`
- [ ] T008 Implement lightweight storage service `backend/src/services/storage.ts` with `saveFile`, `getFilePath`, `listExports` APIs
- [ ] T009 Implement transcription service interface `backend/src/services/transcription.ts` (FR-002) — function `transcribe(mediaPath, options)` that returns `Transcript` and persists JSON to `backend/uploads/transcripts/{mediaId}.json`
- [ ] T010 Add background job runner stub `backend/src/services/jobs.ts` (enqueue, status) for async transcription and exports
- [ ] T011 Add API contract types in `shared/types/index.ts` for `MediaFile`, `Transcript`, `Project`, and `EditRequest/EditResponse`

## Phase 3: [US1] Import, Transcribe, Edit (Priority: P1)

- [ ] T012 [US1] Frontend: Add file selector + upload button in `frontend/src/app/page.tsx` to POST to `/api/media/upload` and show upload progress
- [ ] T013 [US1] Backend: Wire `POST /api/media/upload` route in `backend/src/routes/media.ts` to call `storage.saveFile` and enqueue transcription job
- [ ] T014 [US1] Backend: Implement `GET /api/media/:id/transcript` to return `Transcript` status/result from `backend/uploads/transcripts/{id}.json`
- [ ] T015 [US1] Frontend: Fetch and display transcription results in `frontend/src/components/editor/TranscriptEditor.tsx` (polling or websocket)
- [ ] T016 [US1] Frontend: Implement word-click → `seekTo(time)` already present; add UI to select a range of words (shift+click drag) in `TranscriptEditor.tsx`
- [ ] T017 [US1] Frontend: Implement selection → Cut button that sends `POST /api/media/{mediaId}/edits` with `EditRequest` (start/end) and updates local `editorStore` state
- [ ] T018 [US1] Backend: Implement `POST /api/media/{mediaId}/edits` in `backend/src/routes/transcription.ts` to persist edits to `backend/uploads/projects/{projectId}.json` (or media-specific edits)
- [ ] T019 [US1] Frontend: Persist project state locally and enable reloading from `backend` via `GET /api/projects/{id}`

## Phase 4: [US2] Timeline & Multi-track (Priority: P2)

- [ ] T020 [P] [US2] Frontend: Implement track management UI in `frontend/src/components/editor/Toolbar.tsx` (Add track menu)
- [ ] T021 [US2] Frontend: Implement timeline split (S key) in `frontend/src/components/timeline/Timeline.tsx` and update `frontend/src/stores/editorStore.ts`
- [ ] T022 [US2] Frontend: Implement drag/drop clip move and snapping behavior in `frontend/src/components/timeline/Timeline.tsx`
- [ ] T023 [US2] Backend: Persist timeline/project state via `backend/src/services/storage.ts` and `backend/src/routes/projects.ts`
- [ ] T024 [US2] Backend: Implement thumbnail generation job `backend/src/services/videoProcessing.ts` using FFmpeg; store thumbnails under `backend/uploads/thumbnails/{mediaId}/`

## Phase 5: [US3] Export (Priority: P3)

- [ ] T025 [US3] Frontend: Add Export UI in `frontend/src/components/editor/Toolbar.tsx` with export options (basic)
- [ ] T026 [US3] Backend: Implement export endpoint `POST /api/exports` in `backend/src/routes/export.ts` that enqueues export job and returns job id
- [ ] T027 [US3] Backend: Export job in `backend/src/services/videoProcessing.ts` invokes FFmpeg with safe temp files, emits progress via SSE or polling, stores final MP4 in `backend/uploads/exports/`
- [ ] T028 [US3] Frontend: Show export progress and provide download link when ready (`/api/exports/{id}/download`)

## Final Phase: Polish & Cross-cutting

- [ ] T029 Add Vitest unit tests for `frontend/src/lib/utils.ts` and `backend/src/services/transcription.ts` (`frontend/__tests__`, `backend/tests`)
- [ ] T030 Add Playwright E2E tests for upload→transcribe→cut→playback flow in `frontend/e2e/`
- [ ] T031 Add contract/unit tests to validate `shared/types` serialization and API request/response shapes
- [ ] T032 Add CI job config (GitHub Actions) to run `npx tsc --noEmit`, `npm run lint`, `npx vitest` and optionally Playwright smoke tests
- [ ] T033 Update `README.md` and `specs/text-driven-edit/quickstart.md` with developer steps and P1 demo script
- [ ] T034 Add monitoring/logging guidelines for media jobs (structured logs, error codes)

# Additional Tasks (Validation & Job Semantics)

- [ ] T035 Add transcript accuracy test harness and sample corpus in `specs/text-driven-edit/tests/accuracy/` to validate SC-002 (automated script and sample audio files)
- [ ] T036 Define and implement job semantics and status API: add `backend/src/services/jobs.ts` and `backend/src/routes/jobs.ts` to support enqueue/status/retry/cancel and frontend polling/SSE contract (document API in `specs/text-driven-edit/contracts/jobs.md`)

- [ ] T035 Add transcript accuracy tests and sample corpus: create automated tests that measure word-timestamp alignment and word-error-rate against a labeled corpus (place under `backend/tests/transcription`).
- [ ] T036 Define job semantics and progress API: document enqueue/retry/ttl semantics for background jobs and add an API for job status (SSE or polling) (`backend/src/services/jobs.ts` + `/api/jobs`).

## Dependencies

- 核心顺序: Phase1 → Phase2 → Phase3 (US1) → Phase4 (US2) → Phase5 (US3) → Final

## Parallel Execution Examples

- `T020` (track UI) and `T024` (thumbnail generation) can run in parallel. `T012` (upload UI) and `T013` (upload route) are parallelizable for frontend/backend workstreams.

## Implementation Strategy

- MVP scope: Complete Phase 3 (US1) minimal implementation — upload, asynchronous transcription, transcript selection → cut that updates timeline state and persists edits. Use local storage and simple job runner for dev.

