<!--
  SYNC IMPACT REPORT
  ==================
  Version change: N/A (initial) → 1.0.0
  
  Modified principles: None (initial creation)
  
  Added sections:
  - Core Principles (5 total): User-Centric Design, Real-Time Performance, 
    Type Safety & Contracts, Test Coverage, Graceful Degradation
  - Development Standards
  - Code Quality Gates
  - Governance
  
  Removed sections: None (initial creation)
  
  Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ No updates needed (generic Constitution Check reference)
  - .specify/templates/spec-template.md: ✅ No updates needed (generic structure)
  - .specify/templates/tasks-template.md: ✅ No updates needed (generic structure)
  
  Follow-up TODOs: None
-->

# Descript Clone Constitution

## Core Principles

### I. User-Centric Design

Every feature MUST prioritize user experience and workflow efficiency:

- **Text-First Editing**: The transcript MUST be the primary editing interface; video timeline is secondary
- **Immediate Feedback**: User actions MUST provide visual/audio feedback within 100ms
- **Non-Destructive Editing**: All edits MUST be reversible; original media MUST never be modified
- **Progressive Disclosure**: Complex features MUST be discoverable but not overwhelming to new users

**Rationale**: A Descript-like editor differentiates itself through intuitive text-based video editing. User experience is the core value proposition.

### II. Real-Time Performance

UI interactions MUST maintain responsiveness regardless of media file size:

- **60fps Target**: Timeline scrubbing, playback, and selection MUST render at 60fps (≤16ms frame time)
- **Optimistic Updates**: UI state MUST update immediately; backend sync happens asynchronously
- **Lazy Loading**: Large transcripts and timeline data MUST load progressively
- **Background Processing**: Transcription, export, and heavy computation MUST run in background workers/jobs

**Rationale**: Video editing is inherently interactive. Laggy UI destroys the editing experience and user trust.

### III. Type Safety & Contracts

All data boundaries MUST be type-safe and validated:

- **Shared Types**: Frontend and backend MUST share type definitions via `shared/types/`
- **API Contracts**: All API endpoints MUST have typed request/response schemas
- **Runtime Validation**: External inputs (uploads, API responses, user input) MUST be validated at runtime
- **No `any`**: TypeScript `any` type is forbidden except in explicitly justified edge cases

**Rationale**: A media editing app handles complex data structures (transcripts, timelines, clips). Type safety prevents subtle bugs that corrupt user projects.

### IV. Test Coverage

Critical paths MUST have automated test coverage:

- **API Contract Tests**: All backend endpoints MUST have contract tests verifying request/response shapes
- **Integration Tests**: User journeys (upload → transcribe → edit → export) MUST have end-to-end tests
- **Unit Tests**: Complex business logic (timeline operations, transcript parsing) MUST have unit tests
- **Visual Regression**: UI components with complex state (timeline, transcript editor) SHOULD have snapshot tests

**Rationale**: Video editing involves complex state management. Tests catch regressions before they corrupt user projects.

### V. Graceful Degradation

The system MUST handle failures gracefully:

- **Partial Functionality**: If transcription fails, users MUST still be able to edit via timeline manually
- **Clear Error States**: All async operations MUST surface clear error messages with retry options
- **Data Persistence**: Project state MUST be auto-saved; crashes MUST NOT lose more than 30 seconds of work
- **Offline Resilience**: Local project state MUST be preserved even if backend is unavailable

**Rationale**: Media projects represent significant user investment. Data loss or unclear failures destroy user trust.

## Development Standards

### Technology Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Zustand, React Query
- **Backend**: Express.js, TypeScript, FFmpeg for video processing
- **Shared**: TypeScript types in `shared/types/` consumed by both frontend and backend
- **Testing**: Vitest (frontend), Jest (backend), Playwright (E2E)

### File Organization

- **Components**: One component per file, co-located with styles and tests
- **Services**: Business logic in `services/` directories, separated from route handlers
- **State**: Zustand stores in `stores/` with clear action/selector separation
- **API**: RESTful endpoints in `routes/`, with middleware in `middleware/`

### Code Style

- **Formatting**: Prettier with project defaults; enforced via pre-commit hooks
- **Linting**: ESLint with TypeScript rules; zero warnings policy
- **Naming**: PascalCase for components/types, camelCase for functions/variables, kebab-case for files
- **Comments**: JSDoc for public APIs; inline comments for non-obvious logic only

## Code Quality Gates

Before merging any feature:

1. **Type Check**: `tsc --noEmit` MUST pass with zero errors
2. **Lint**: ESLint MUST pass with zero warnings
3. **Tests**: All existing tests MUST pass; new features MUST include tests for critical paths
4. **Build**: Production build MUST complete successfully
5. **Constitution Compliance**: Changes MUST not violate any Core Principle

## Governance

This constitution defines non-negotiable standards for the Descript Clone project.

### Amendment Process

1. Propose amendment with rationale in a dedicated PR
2. Document impact on existing code and migration plan
3. Update version according to semantic versioning:
   - **MAJOR**: Removing or redefining a Core Principle
   - **MINOR**: Adding new principles or expanding existing guidance
   - **PATCH**: Clarifications, typo fixes, non-semantic refinements
4. All active contributors MUST acknowledge the change

### Compliance

- All PRs MUST be reviewed against Core Principles
- Violations require explicit justification and tech debt tracking
- Use `.specify/memory/constitution.md` as the authoritative reference

**Version**: 1.0.0 | **Ratified**: 2026-01-25 | **Last Amended**: 2026-01-25
