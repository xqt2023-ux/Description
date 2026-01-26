# Implementation Plan: Text-driven Video Editing

**Branch**: `main` | **Date**: 2026-01-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/main/spec.md`

## Summary

Implement text-driven video editing MVP enabling users to: (1) upload video and receive automatic transcription with word-level timestamps via Groq Whisper API, (2) edit video by selecting words/phrases in the transcript to cut/split, (3) manage multi-track timeline with drag-drop clip repositioning, and (4) export edited timeline to MP4 via FFmpeg. The approach leverages existing Next.js/Express architecture with Zustand for state management.

## Technical Context

**Language/Version**: TypeScript 5.4+, Node.js 18+  
**Primary Dependencies**: Next.js 14 (App Router), Express.js, FFmpeg, Groq SDK, Zustand, React Query, Slate.js  
**Storage**: Local file system for MediaFile (`backend/uploads/`), JSON files for project state (MVP)  
**Testing**: Vitest (frontend), Playwright (E2E)  
**Target Platform**: Web (Chrome, Firefox, Safari), Windows/macOS/Linux dev environments  
**Project Type**: Web application (frontend + backend + shared types)  
**Performance Goals**: 60fps timeline interactions, <5s first partial transcript, <2min full transcription for ≤60s clips  
**Constraints**: 500MB max file size, <100ms UI feedback latency, auto-save with ≤30s data loss  
**Scale/Scope**: Single-user MVP, ~5 main screens (home, editor, export dialog)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. User-Centric Design | ✅ PASS | Text-first editing is core of US1; non-destructive edits via timeline state |
| II. Real-Time Performance | ✅ PASS | NFR-001 targets 60fps; NFR-002 defines streaming transcript SLOs |
| III. Type Safety & Contracts | ✅ PASS | Shared types exist in `shared/types/`; Word interface already defined |
| IV. Test Coverage | ⚠️ DEFERRED | MVP defers comprehensive tests; critical paths will have smoke tests |
| V. Graceful Degradation | ✅ PASS | NFR-004 mandates error states with retry; auto-save required |

**Gate Result**: PASS (IV. Test Coverage deferred with justification for MVP scope)

### Post-Design Re-Check (Phase 1 Complete)

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. User-Centric Design | ✅ PASS | Contracts define text-first transcript editing via `Word.deleted` flag; non-destructive by design (original mediafile untouched) |
| II. Real-Time Performance | ✅ PASS | Data model supports optimistic updates (Zustand + immer); polling + SSE hybrid for async jobs; lazy loading via segments |
| III. Type Safety & Contracts | ✅ PASS | Full API contracts in `contracts/*.md`; data model in `data-model.md`; all entities typed in `shared/types/` |
| IV. Test Coverage | ⚠️ DEFERRED | No test tasks in Phase 3-5; smoke test coverage planned for P1 flow only |
| V. Graceful Degradation | ✅ PASS | All contracts include error responses with retry hints; auto-save endpoint defined; manual timeline editing possible if transcription fails |

**Post-Design Gate**: PASS (same deferral justification applies)

## Project Structure

### Documentation (this feature)

```text
specs/main/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API schemas)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── index.ts              # Express server entry
│   ├── middleware/
│   │   ├── errorHandler.ts   # Error handling + retry support
│   │   └── upload.ts         # Multer config + 500MB validation
│   ├── routes/
│   │   ├── media.ts          # POST /api/media/upload
│   │   ├── transcription.ts  # POST/GET /api/transcription/*
│   │   ├── projects.ts       # Project CRUD
│   │   └── export.ts         # POST/GET /api/export/*
│   └── services/
│       ├── transcription.ts  # Groq Whisper integration
│       ├── storage.ts        # File + JSON persistence
│       └── videoProcessing.ts # FFmpeg operations
├── uploads/
│   ├── videos/
│   ├── audio/
│   ├── thumbnails/
│   └── exports/
└── tests/

frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Home/upload page
│   │   └── editor/[projectId]/page.tsx
│   ├── components/
│   │   ├── editor/
│   │   │   ├── DescriptEditor.tsx
│   │   │   ├── TranscriptEditor.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── MediaUploader.tsx
│   │   │   └── ExportDialog.tsx
│   │   └── timeline/
│   │       └── Timeline.tsx
│   ├── stores/
│   │   └── editorStore.ts    # Zustand project/timeline state
│   └── lib/
│       ├── api.ts            # API client
│       └── utils.ts
└── __tests__/

shared/
└── types/
    └── index.ts              # Project, Media, Transcript, Timeline types
```

**Structure Decision**: Web application pattern (Option 2) - frontend/ + backend/ + shared/ already exists and matches constitution's technology stack.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| IV. Test Coverage deferred | MVP timeline pressure | Will add contract tests for critical paths post-MVP; smoke tests cover P1 flow |
