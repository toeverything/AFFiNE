# AION Agent Platform

## Overview

The Agent Platform is a module within the AFFiNE monorepo that wraps **Claude Code CLI** to convert "Brief" documents into analyzed plans and applied changes with full traceability and approval.

It does NOT call LLM APIs directly — instead it orchestrates Claude Code (`claude --print --output-format json --json-schema ...`) as a subprocess, leveraging all of Claude Code's built-in capabilities (code analysis, file editing, git operations).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AFFiNE Frontend (React)                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Agent Platform Module                            │  │
│  │  - AgentPlatformStore (API client + LiveData)     │  │
│  │  - AgentPlatformService (public API)              │  │
│  │  - AgentPanel (sidebar tab UI)                    │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │ fetch /api/agent/v1/*            │
└───────────────────────┼─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│  AFFiNE Backend (NestJS)                                │
│  ┌────────────────────┴──────────────────────────────┐  │
│  │  AgentPlatformModule (plugin)                     │  │
│  │  ┌──────────────┐  ┌──────────────────────────┐   │  │
│  │  │ Controller   │  │ AgentPlatformService     │   │  │
│  │  │ REST API v1  │──│ (orchestrator)           │   │  │
│  │  └──────────────┘  └──────┬───────────────────┘   │  │
│  │                           │                       │  │
│  │  ┌──────────────┐  ┌─────┴──────┐  ┌──────────┐  │  │
│  │  │ SQLite       │  │ Claude Code│  │ Repo     │  │  │
│  │  │ Storage      │  │ Adapter    │  │ Adapter  │  │  │
│  │  │ (self-cont.) │  │ (CLI wrap) │  │ + Security│ │  │
│  │  └──────────────┘  └─────┬──────┘  └──────────┘  │  │
│  └───────────────────────────┼───────────────────────┘  │
└───────────────────────────────┼─────────────────────────┘
                                │
                    ┌───────────┴────────────┐
                    │  claude CLI            │
                    │  (Claude Code)         │
                    │  --print               │
                    │  --output-format json  │
                    │  --json-schema {...}   │
                    └────────────────────────┘
```

## Flow (2-Phase Commit)

```
Brief Document
    │
    ├─ 1. createRun(workspaceId, docId, briefContent)
    │     → Run { runId, status: "created" }
    │
    ├─ 2. analyzeAmbiguity(runId, briefContent)
    │     → Claude Code identifies gaps, unclear requirements
    │     → { ambiguities: [...] }
    │
    ├─ 3. generatePlan(runId, briefContent)
    │     → Claude Code creates epics/tasks/checkpoints
    │     → { plan: { epics, tasks, checkpoints } }
    │
    ├─ 4. proposeChanges(runId, briefContent, plan)
    │     → Claude Code proposes brief edits + repo patches
    │     → Proposal { briefEdits, repoPatches }
    │     → Security validation (path traversal, denylists, size)
    │
    ├─ 5. preview(runId, proposalId, briefContent)
    │     → Unified diffs for brief and repo
    │     → User reviews in sidebar
    │
    ├─ 6. approve(runId, proposalId, actor)     ← EXPLICIT APPROVAL REQUIRED
    │     → Approval record created
    │
    ├─ 7. apply(runId, approvalId)
    │     → Repo patches written to filesystem
    │     → Brief edits returned to frontend
    │
    └─ 8. createPR(runId, approvalId)           ← OPTIONAL
          → git branch + commit + push + gh pr create
```

**Key invariant**: Steps 7 and 8 CANNOT execute without step 6 (approval). This is enforced at the service layer.

## Boundaries

| Component | Touches AFFiNE core? | Storage |
|---|---|---|
| Backend plugin | Only `app.module.ts` (one `.use()` line) | Own SQLite DB |
| Frontend module | `modules/index.ts` + `detail-page.tsx` sidebar tab | LiveData (in-memory) |
| Contracts | Standalone package `@aion/agent-contracts` | N/A |

## Threat Model

| Threat | Mitigation |
|---|---|
| Path traversal in patches | Resolved path checked against repo root |
| Secret file modification | FORBIDDEN_PATH_PATTERNS regex denylists (.env, .pem, id_rsa, secrets, node_modules, dist, build) |
| Oversized patches | MAX_PATCH_BYTES limit (default 1MB) |
| Unauthorized repo access | ALLOWED_REPOS allowlist |
| Claude Code prompt injection | System prompt is hardcoded server-side; user content is passed as user prompt only |
| Unapproved changes | 2-phase commit: propose → approve → apply; no apply without approval record |

## Security Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `ALLOWED_REPOS` | Comma-separated list of allowed repo paths/IDs | (empty = all allowed) |
| `ALLOWED_PATHS` | Comma-separated list of allowed file path prefixes | (empty = all allowed) |
| `FORBIDDEN_PATHS` | Additional forbidden path patterns | (empty) |
| `MAX_PATCH_BYTES` | Maximum total patch size in bytes | 1000000 |

## Dependencies

- `claude` CLI must be installed and authenticated
- `gh` CLI (optional, for PR creation)
- `better-sqlite3` for local storage
- `diff` npm package for unified diffs

## File Index

### Contracts
- `packages/common/agent-contracts/src/index.ts` — Zod schemas, types, security constants

### Backend Plugin
- `packages/backend/server/src/plugins/agent-platform/index.ts` — NestJS module
- `packages/backend/server/src/plugins/agent-platform/agent.controller.ts` — REST API
- `packages/backend/server/src/plugins/agent-platform/agent.service.ts` — Orchestrator
- `packages/backend/server/src/plugins/agent-platform/storage/sqlite.adapter.ts` — SQLite persistence
- `packages/backend/server/src/plugins/agent-platform/llm/claude-code.adapter.ts` — Claude Code CLI wrapper
- `packages/backend/server/src/plugins/agent-platform/repo/repo.adapter.ts` — Git/filesystem operations
- `packages/backend/server/src/plugins/agent-platform/repo/security.ts` — Path validation, denylists

### Frontend Module
- `packages/frontend/core/src/modules/agent-platform/index.ts` — Module config
- `packages/frontend/core/src/modules/agent-platform/stores/agent.ts` — API client store
- `packages/frontend/core/src/modules/agent-platform/services/agent.ts` — Public service
- `packages/frontend/core/src/modules/agent-platform/views/agent-panel.tsx` — Sidebar panel UI
- `packages/frontend/core/src/modules/agent-platform/views/styles.css.ts` — Vanilla Extract styles

### Integration Points (modified files)
- `packages/backend/server/src/app.module.ts` — Added `.use(AgentPlatformModule)`
- `packages/frontend/core/src/modules/index.ts` — Added `configureAgentPlatformModule`
- `packages/frontend/core/src/desktop/pages/workspace/detail-page/detail-page.tsx` — Added Agent sidebar tab
