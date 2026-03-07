<!--
SYNC IMPACT REPORT
==================
Version change: N/A → 1.0.0 (initial ratification)

Modified principles: N/A (initial creation from template)

Added sections:
  - Core Principles (5 principles)
  - Technology Stack
  - Development Workflow
  - Governance

Removed sections: N/A

Templates checked:
  ✅ .specify/templates/plan-template.md       — Constitution Check gate present; aligns with all 5 principles
  ✅ .specify/templates/spec-template.md       — User stories + FRs + success criteria align with principles
  ✅ .specify/templates/tasks-template.md      — Phase/story grouping and parallel markers align with principles
  ✅ .specify/templates/checklist-template.md  — Generic; no principle conflicts
  ✅ .specify/templates/agent-file-template.md — Generic; no principle conflicts
  ✅ .specify/templates/constitution-template.md — Source template; no update needed

Deferred TODOs:
  - TODO(RATIFICATION_DATE): Exact original adoption date unknown.
    Approximated as 2022-11-01 (first public release period). Update if known.
-->

# AFFiNE Constitution

## Core Principles

### I. Local-First Data Ownership

All features MUST treat user data as locally owned by default. No feature
MUST transmit user content to remote servers without explicit user consent
and clear disclosure. Cloud sync is an opt-in enhancement, never a
requirement for core functionality. User data MUST be readable and
exportable without network access at all times.

**Rationale**: AFFiNE's founding proposition is privacy-focused,
local-first design. Any feature that undermines this erodes the product's
core value and user trust.

### II. Block-Centric Architecture

Every piece of content MUST be represented as a composable block. New
content types MUST be implemented as first-class block types — not as
special-cased editor modes or embedded blobs. Blocks MUST be independently
movable, linkable, and renderable in both doc and edgeless (canvas) views.

**Rationale**: The unified block model enables AFFiNE's "hyper-merged"
docs + canvas experience. Bypassing the block model creates second-class
content that cannot participate in cross-view rendering or collaborative
sync.

### III. Real-Time Collaboration via CRDT

All persistent state MUST be represented using CRDT-compatible data
structures (y-octo / yjs). Features MUST NOT introduce shared mutable state
that cannot be merged deterministically. Conflict resolution MUST be
automatic and lossless — no feature MUST silently discard concurrent edits.

**Rationale**: Real-time multi-user collaboration is non-negotiable.
Designs that bypass CRDT create split-brain data corruption under concurrent
use.

### IV. Test-Driven Quality Gates

New features and bug fixes MUST be accompanied by automated tests before
merge. The test pyramid MUST be respected: unit tests for logic, integration
tests for service boundaries, Playwright end-to-end tests for critical user
journeys. Tests MUST be written to fail first (red) then pass (green) before
implementation is considered complete.

**Rationale**: The codebase spans TypeScript (frontend/backend), Rust
(native/server-native), and React. Without enforced test gates, regressions
compound rapidly across the multi-package monorepo.

### V. Simplicity and YAGNI

Every abstraction layer or new dependency MUST be justified by a concrete
current need. Code MUST NOT be added for hypothetical future requirements.
Complexity MUST be documented in the plan's Complexity Tracking table with
explicit rationale for why simpler alternatives were rejected. Packages MUST
NOT be added to the monorepo without a clear ownership boundary.

**Rationale**: AFFiNE is a large monorepo with many contributors.
Premature abstractions impose a permanent maintenance burden and slow
onboarding.

## Technology Stack

- **Frontend**: TypeScript 5.x, React 18+, Vite/Rspack, Jotai (state),
  Vanilla Extract (styling), Playwright (E2E), Vitest (unit/integration)
- **Backend**: Node.js, NestJS, TypeScript, GraphQL, Prisma
- **Native / Performance**: Rust (napi-rs bindings, y-octo CRDT engine)
- **Desktop**: Electron
- **Monorepo tool**: Yarn 4 workspaces — MUST NOT use npm or pnpm
- **Linting**: ESLint 9 + oxlint + Prettier; all MUST pass before merge

Any addition to the above stack MUST be discussed via PR and reflected in
this section before implementation begins.

## Development Workflow

1. **Spec first**: Every non-trivial feature MUST have a `spec.md`
   capturing user stories with acceptance scenarios before implementation.
2. **Plan before code**: A `plan.md` MUST exist and pass the Constitution
   Check gate before Phase 0 research begins.
3. **Branch strategy**: Feature branches MUST target `canary`. Direct pushes
   to `canary` or `main` are prohibited except for hotfixes with team lead
   approval.
4. **PR review**: All PRs MUST receive at least one approving review from a
   maintainer. Self-merges are prohibited.
5. **Changelog**: User-visible changes MUST include a `CHANGELOG.md` entry.
6. **Lint + typecheck gate**: `yarn lint` and `yarn typecheck` MUST pass
   before a PR is opened. CI enforces this; failing checks block merge.
7. **Test gate**: All tests referenced in a feature's `tasks.md` MUST pass.
   Skipped tests MUST be justified with a tracking issue reference.

## Governance

This constitution supersedes all informal conventions and README guidance
where they conflict. Amendments follow this procedure:

1. Open a PR modifying `.specify/memory/constitution.md`.
2. Include a Sync Impact Report (as an HTML comment at the top of the file)
   listing version change, modified/added/removed sections, and template
   update status.
3. Obtain approval from at least two maintainers.
4. Increment `CONSTITUTION_VERSION` per semantic versioning:
   - **MAJOR**: Principle removal, redefinition, or backward-incompatible
     governance change.
   - **MINOR**: New principle, new section, or materially expanded guidance.
   - **PATCH**: Clarifications, wording fixes, or non-semantic refinements.
5. Update `LAST_AMENDED_DATE` to the merge date (ISO format YYYY-MM-DD).
6. Propagate changes to all `.specify/templates/` files as required and
   mark them ✅ in the Sync Impact Report.

All PRs and design reviews MUST verify compliance with the five principles
above. Undocumented complexity violations are grounds for PR rejection.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): approximate 2022-11-01 | **Last Amended**: 2026-03-07
