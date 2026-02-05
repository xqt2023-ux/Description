# Implementation Plan: Text-Driven Video Editing

**Branch**: `main` | **Date**: 2026-01-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/main/spec.md`

## Summary

Implement a Descript-like text-driven video editor MVP that allows users to:
1. Upload video files and receive automatic transcription with word-level timestamps
2. Edit video by selecting/cutting/splitting text in the transcript
3. Export the edited timeline to MP4

The technical approach uses Groq Whisper API for transcription, Zustand with immer for timeline state management with undo/redo, and FFmpeg for video export. Playback previews use client-side skip logic without re-encoding.

## Technical Context

**Language/Version**: TypeScript 5.4+, Node.js 18+  
**Primary Dependencies**:  
- Frontend: Next.js 14 (App Router), Zustand, React Query, Tailwind CSS, Slate.js
- Backend: Express.js, FFmpeg, Groq SDK, Zod  
**Storage**: File-based (uploads/), in-memory project state (localStorage persistence)  
**Testing**: Vitest (frontend + backend), Playwright (E2E future)  
**Target Platform**: Web (Chrome/Firefox/Safari, desktop-first)  
**Project Type**: Web application (frontend + backend + shared types)  
**Performance Goals**: 60fps timeline interactions, <100ms UI feedback, <2min transcription for short clips  
**Constraints**: ≤500MB file uploads, single-user MVP, local storage only  
**Scale/Scope**: Single user, ~10 screens, MVP feature set

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| **I. User-Centric Design** | | | |
| Text-First Editing | Transcript is primary editing interface | ✅ PASS | FR-003: transcript with selectable word ranges |
| Immediate Feedback | Actions provide feedback within 100ms | ✅ PASS | NFR-001: optimistic updates, 60fps target |
| Non-Destructive Editing | Edits reversible, originals never modified | ✅ PASS | Undo/redo stack, source files untouched |
| Progressive Disclosure | Complex features discoverable | ✅ PASS | MVP focuses on core cut/split only |
| **II. Real-Time Performance** | | | |
| 60fps Target | Timeline at ≤16ms frame time | ✅ PASS | NFR-001 explicitly targets this |
| Optimistic Updates | UI updates immediately | ✅ PASS | Zustand state updates sync |
| Lazy Loading | Large data loads progressively | ✅ PASS | Transcript segments load on demand |
| Background Processing | Heavy compute in workers/jobs | ✅ PASS | Transcription + export are async jobs |
| **III. Type Safety & Contracts** | | | |
| Shared Types | Frontend/backend share types | ✅ PASS | `shared/types/index.ts` in use |
| API Contracts | Typed request/response schemas | ✅ PASS | contracts/ directory with specs |
| Runtime Validation | External inputs validated | ✅ PASS | Zod for uploads, API validation |
| No `any` | TypeScript any forbidden | ✅ PASS | Strict tsconfig |
| **IV. Test Coverage** | | | |
| API Contract Tests | Endpoints have contract tests | ✅ PASS | `backend/tests/contracts/` exists |
| Integration Tests | User journeys have E2E tests | ⚠️ DEFER | E2E deferred post-MVP |
| Unit Tests | Complex logic has unit tests | ✅ PASS | Timeline operations tested |
| **V. Graceful Degradation** | | | |
| Partial Functionality | Manual timeline edit if transcription fails | ✅ PASS | FR-004: timeline edits independent |
| Clear Error States | Async ops surface errors with retry | ✅ PASS | NFR-004 requires this |
| Data Persistence | Auto-save, <30s data loss on crash | ✅ PASS | Zustand persist middleware |
| Offline Resilience | Local state preserved | ✅ PASS | localStorage persistence |

**Gate Result**: ✅ PASSED (1 deferred item tracked)

## Project Structure

### Documentation (this feature)

```text
specs/main/
├── plan.md              # This file
├── research.md          # Phase 0 output ✅
├── data-model.md        # Phase 1 output ✅
├── quickstart.md        # Phase 1 output ✅
├── contracts/           # Phase 1 output ✅
│   ├── export.md
│   ├── media.md
│   ├── projects.md
│   └── transcription.md
└── tasks.md             # Phase 2 output (existing)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── index.ts              # Express server entry
│   ├── middleware/           # Error handling, upload config
│   ├── routes/               # API route handlers
│   │   ├── ai.ts
│   │   ├── export.ts
│   │   ├── jobs.ts
│   │   ├── media.ts
│   │   ├── projects.ts
│   │   └── transcription.ts
│   └── services/             # Business logic
│       ├── claude.ts
│       ├── jobs.ts
│       ├── openai.ts
│       ├── storage.ts
│       ├── transcription.ts
│       ├── videoEditOrchestration.ts
│       └── videoProcessing.ts
├── tests/
│   └── contracts/
│       └── api.contract.test.ts
└── uploads/                  # File storage
    ├── audio/
    ├── exports/
    ├── images/
    ├── projects/
    ├── thumbnails/
    └── videos/

frontend/
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── editor/[projectId]/page.tsx
│   ├── components/
│   │   ├── editor/           # Editor components
│   │   │   ├── DescriptEditor.tsx
│   │   │   ├── TranscriptEditor.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   └── ...
│   │   └── timeline/
│   │       └── Timeline.tsx
│   ├── lib/                  # Utilities, API client
│   │   └── api.ts
│   └── stores/               # Zustand state
│       └── editorStore.ts
└── src/__tests__/            # Frontend tests

shared/
└── types/
    └── index.ts              # Shared TypeScript types
```

**Structure Decision**: Web application structure with `frontend/`, `backend/`, and `shared/` directories. This matches the existing codebase and constitution's Development Standards.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| E2E tests deferred | MVP timeline constraint | Will add Playwright after core features stable |

## Phase Outputs

- **Phase 0 (Research)**: [research.md](research.md) ✅ Complete
- **Phase 1 (Design)**: 
  - [data-model.md](data-model.md) ✅ Complete
  - [contracts/](contracts/) ✅ Complete  
  - [quickstart.md](quickstart.md) ✅ Complete
- **Phase 2 (Tasks)**: [tasks.md](tasks.md) - Run `/speckit.tasks` to generate
