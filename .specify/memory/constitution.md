<!--
  SYNC IMPACT REPORT
  ==================
  Version change: 1.1.0 → 1.2.0

  Modified principles:
  - Core Principle IV: Test Coverage - Enhanced with mandatory TDD workflow requirements

  Added sections:
  - New Development Standards section: Test-Driven Development (TDD) Workflow

  Removed sections: None

  Changes in this version:
  - Enhanced Core Principle IV with TDD workflow mandate
  - Added detailed TDD workflow standards in Development Standards section
  - Specified Red-Green-Refactor cycle as mandatory practice
  - Added TDD compliance to Code Quality Gates
  - Updated version to 1.2.0 (MINOR: new standards added)
  - Updated Last Amended date to 2026-02-05

  Templates requiring updates:
  - All development workflows must now follow TDD practices
  - Code review checklists should verify TDD compliance

  Follow-up TODOs:
  - Update PR templates to include TDD checklist
  - Add TDD examples to developer documentation
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

### IV. Test Coverage & Test-Driven Development

All development MUST follow Test-Driven Development (TDD) workflow, and critical paths MUST have automated test coverage:

- **TDD Mandatory**: All new features and bug fixes MUST be developed using TDD workflow (Write failing test → Implement minimal code → Refactor)
- **Test-First**: No production code may be written without a failing test that demonstrates the need for that code
- **API Contract Tests**: All backend endpoints MUST have contract tests verifying request/response shapes
- **Integration Tests**: User journeys (upload → transcribe → edit → export) MUST have end-to-end tests
- **Unit Tests**: Complex business logic (timeline operations, transcript parsing) MUST have unit tests
- **Visual Regression**: UI components with complex state (timeline, transcript editor) SHOULD have snapshot tests
- **Refactoring Safety**: Tests MUST remain green during refactoring; if tests break, the refactoring MUST be reconsidered

**Rationale**: Video editing involves complex state management. TDD ensures robust design and comprehensive test coverage from the start. Tests catch regressions before they corrupt user projects, and the test-first approach leads to more maintainable, decoupled code.

### V. Graceful Degradation

The system MUST handle failures gracefully:

- **Partial Functionality**: If transcription fails, users MUST still be able to edit via timeline manually
- **Clear Error States**: All async operations MUST surface clear error messages with retry options
- **Data Persistence**: Project state MUST be auto-saved; crashes MUST NOT lose more than 30 seconds of work
- **Offline Resilience**: Local project state MUST be preserved even if backend is unavailable

**Rationale**: Media projects represent significant user investment. Data loss or unclear failures destroy user trust.

### VI. Question-Driven Planning

在写任何代码之前，只在规划模式下无休止地质疑我的想法。不要假设任何事情。问问题，直到没有任何假设为止。

Before writing any code, ideas MUST be endlessly questioned during planning phases:

- **Assumption Elimination**: Every technical decision MUST be backed by explicit reasoning; no assumptions allowed
- **Continuous Inquiry**: Planning sessions MUST include persistent questioning of requirements, constraints, and approaches
- **Challenge Everything**: Project team members MUST challenge each other's ideas until all assumptions are surfaced and validated
- **Documentation of Questions**: All questions raised during planning MUST be documented with their answers or research outcomes

**Rationale**: Assumptions are the root cause of most failed software projects. By cultivating a culture of relentless questioning during planning, we prevent costly redesigns and ensure robust foundations.

## Development Standards

### Technology Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Zustand, React Query
- **Backend**: Express.js, TypeScript, FFmpeg for video processing
- **Shared**: TypeScript types in `shared/types/` consumed by both frontend and backend
- **Testing**: Vitest (frontend + backend), Playwright (E2E)

### File Organization

- **Components**: One component per file, co-located with styles and tests
- **Services**: Business logic in `services/` directories, separated from route handlers
- **State**: Zustand stores in `stores/` with clear action/selector separation
- **API**: RESTful endpoints in `routes/`, with middleware in `middleware/`

### Test-Driven Development (TDD) Workflow

All development MUST strictly follow the Red-Green-Refactor cycle:

#### 1. RED Phase - Write a Failing Test
- **Before Any Code**: Write a test that describes the desired behavior or fixes a bug
- **Test Must Fail**: Run the test to verify it fails for the right reason (compilation error or assertion failure)
- **Specific Tests**: Each test MUST focus on one specific behavior or requirement
- **Clear Intent**: Test names MUST clearly describe what behavior is being tested (e.g., `should return 404 when project not found`)

#### 2. GREEN Phase - Make It Pass
- **Minimal Implementation**: Write the simplest code that makes the test pass, no more
- **No Over-Engineering**: Do not add functionality not covered by tests
- **Fast Feedback**: Run tests frequently during implementation to verify progress
- **Test Must Pass**: Verify the previously failing test now passes

#### 3. REFACTOR Phase - Improve the Code
- **Tests Stay Green**: All tests MUST remain passing throughout refactoring
- **Code Quality**: Remove duplication, improve naming, enhance readability
- **Design Patterns**: Apply appropriate design patterns where they improve maintainability
- **Performance**: Optimize only when tests prove correctness is maintained

#### TDD Cycle Rules
- **No Production Code Without Tests**: Developers MUST NOT write production code unless it is to make a failing test pass
- **Commit Discipline**: Each completed cycle (Red → Green → Refactor) SHOULD result in a commit
- **Test Coverage**: New code MUST achieve at least 80% test coverage; critical paths MUST achieve 100%
- **Test Maintenance**: Tests are first-class code; they MUST be refactored and maintained like production code

#### Exceptions
The following scenarios MAY bypass strict TDD (but still require tests before merge):
- **Spike/Prototype Work**: Clearly marked exploratory code that will be discarded
- **UI Styling**: Pure visual adjustments with no logic (but accessibility features MUST be tested)
- **Configuration**: Simple configuration file changes (e.g., environment variables)

**Rationale**: TDD enforces a disciplined approach that leads to better design, comprehensive test coverage, and maintainable code. The Red-Green-Refactor cycle ensures tests actually test something (by seeing them fail first) and keeps the codebase clean through continuous refactoring.

### Code Style

- **Formatting**: Prettier MUST be configured with a `.prettierrc` file at project root; MUST be enforced via pre-commit hooks (husky + lint-staged recommended)
- **Linting**: ESLint MUST be configured with TypeScript rules in both frontend and backend; MUST enforce zero warnings policy; MUST run in pre-commit hooks
- **Pre-commit Hooks**: MUST use husky (or equivalent) with lint-staged to run Prettier and ESLint before commits
- **Naming**: PascalCase for components/types, camelCase for functions/variables, kebab-case for files
- **Comments**: JSDoc for public APIs; inline comments for non-obvious logic only

## Code Quality Gates

Before merging any feature:

1. **TDD Compliance**: New code MUST demonstrate TDD workflow was followed (commit history shows test-first approach)
2. **Type Check**: `tsc --noEmit` MUST pass with zero errors
3. **Lint**: ESLint MUST pass with zero warnings
4. **Tests**: All existing tests MUST pass; new features MUST include tests for critical paths
5. **Test Coverage**: New code MUST achieve at least 80% test coverage; critical paths MUST achieve 100%
6. **Build**: Production build MUST complete successfully
7. **Constitution Compliance**: Changes MUST not violate any Core Principle

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

**Version**: 1.2.0 | **Ratified**: 2026-01-25 | **Last Amended**: 2026-02-05
