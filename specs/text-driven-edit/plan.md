# Implementation Plan: Text-driven Video Editing

**Branch**: `text-driven-edit` | **Date**: 2026-01-24 | **Spec**: specs/text-driven-edit/spec.md
**Input**: Feature specification from `specs/text-driven-edit/spec.md`

## Summary

Deliver a Text-Driven Edit MVP: users upload a video, get a word-level transcript, select transcript ranges to cut/split video, and export the edited result. First iteration focuses on P1: upload → transcribe → edit-by-transcript.

## Technical Context

- Language/Version: TypeScript 5.x (frontend/backend)
- Frontend: Next.js 14 (App Router), React, Zustand
- Backend: Node.js + Express, ts-node-dev for dev workflow
- Media Processing: FFmpeg (spawned child processes with timeouts)
- Transcription: Groq Whisper API (whisper-large-v3) with proxy support
- Storage: Local file storage under `backend/uploads/` (MVP)
- Testing: Vitest (unit) + Playwright (E2E)

**Performance Goals**
- Transcript turnaround for short clips (<=30s): < 2 minutes
- Timeline UX: 60fps responsiveness for interactions
- Export progress reporting: continuous progress events

**Constraints**
- Respect constitution: strict TypeScript, shared types in `shared/types/`, API contract stability, async media processing, temp file cleanup.

## Constitution Check

Gates:
- Must use `shared/types/index.ts` for API shape
- FFmpeg invocations MUST run in child processes with timeouts and temporary-file cleanup
- TypeScript strict mode enforced in both projects

## Project Structure (feature-relevant)

```
specs/text-driven-edit/
├── spec.md
├── plan.md        # this file
└── tasks.md
```

## Phases & Milestones

Phase 0 — Setup (1–2 days)
- Ensure `shared/types/index.ts` exists
- Enable strict TypeScript in `frontend` and `backend`
- Create `backend/uploads/` and `backend/uploads/exports/`

Phase 1 — P1 MVP (3–5 days)
- Implement `POST /api/media/upload` (store file, return `MediaFile`)
- Transcription pipeline: enqueue/trigger Groq Whisper call, persist `Transcript`
- Frontend: upload UI + `TranscriptEditor` mapping word timestamps
- Implement cut/split operations in frontend store and persist via `/api/media/edit`
- Basic unit tests for transcription service and transcript → timeline mapping

Phase 2 — Multi-track & UX (2–4 days)
- Tracks UI, split (S key), thumbnails generation
- Persist `Project` state on backend
- More unit + integration tests

Phase 3 — Export (2–3 days)
- FFmpeg-based export pipeline with progress events and stored export files
- E2E Playwright tests covering upload→edit→export

## Risks & Mitigations

- Transcription latency: use background job + progress; for dev use small test clips
- FFmpeg failures: apply timeouts, retry limits, and clear temp files
- API contract drift: maintain `shared/types` and add a contract test

## Deliverables
- `specs/text-driven-edit/plan.md` (this file)
- Implemented endpoints and frontend MVP (Phase 1)
- Tests: Vitest unit tests + Playwright E2E for P1
