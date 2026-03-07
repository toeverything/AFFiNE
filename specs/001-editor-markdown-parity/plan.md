# Implementation Plan: Editor Markdown & Rich Text Parity

**Branch**: `001-editor-markdown-parity` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)

## Summary

Bring the AFFiNE editor (powered by BlockSuite) to full parity with Notion's writing/editing basics and Obsidian-flavored markdown, including GFM extensions. The majority of the required infrastructure already exists in BlockSuite; this feature fills six specific gaps: `==highlight==` shortcut, Obsidian wikilinks `[[...]]`, Obsidian-typed callouts `> [!TYPE]`, Obsidian comments `%% ... %%`, inline `#tags`, and a document-level source mode. All new content types integrate with the existing CRDT block model, Shiki highlighter, KaTeX math renderer, and Mermaid diagram renderer.

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 18+
**Primary Dependencies**: BlockSuite (workspace monorepo), Shiki (syntax highlighting), KaTeX (math), Mermaid ^11.12.2 (diagrams), unified/remark/micromark (markdown parsing), Vanilla Extract (styling), Jotai (state)
**Storage**: y-octo / yjs CRDT — no new storage layer
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web (Electron renderer shares same codebase), PWA
**Project Type**: Frontend feature — monorepo package extensions
**Performance Goals**: Inline markdown shortcuts render within one animation frame of trigger; source mode serialisation/deserialisation completes within 500ms for a 1000-block document
**Constraints**: All new block types MUST be CRDT-compatible; no new monorepo packages without clear ownership boundary; Yarn 4 only; ESLint 9 + Prettier must pass
**Scale/Scope**: Single editor surface; affects all document types (doc + edgeless canvas)

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                             | Status | Notes                                                                                                                                                                                                                      |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Local-First Data Ownership         | PASS   | No new network calls; all features work offline. Wikilink resolution uses local workspace index.                                                                                                                           |
| II. Block-Centric Architecture        | PASS   | Highlight and comment are inline attributes on existing blocks. Wikilinks reuse reference inline. Tags are a new inline spec. Callout type/foldable are new props on existing callout block. Source mode is UI-only state. |
| III. Real-Time Collaboration via CRDT | PASS   | All new persistent state (highlight, comment, calloutType, foldable, folded, tag) is stored in y-octo CRDT delta/props. Source mode edits apply as block mutations on exit, consistent with CRDT model.                    |
| IV. Test-Driven Quality Gates         | PASS   | Each implementation phase specifies unit tests (Vitest) and E2E tests (Playwright) written before implementation is considered complete.                                                                                   |
| V. Simplicity and YAGNI               | PASS   | No new packages required beyond a `tag` inline package. Wikilinks reuse the existing reference inline. Callout types extend the existing callout block. No abstractions for hypothetical future formats.                   |

**No violations. No Complexity Tracking entries required.**

---

## Project Structure

### Documentation (this feature)

```text
specs/001-editor-markdown-parity/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── inline-extensions.md  # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code — affected locations

```text
blocksuite/affine/
├── shared/src/
│   ├── types/index.ts                          # +highlight, +comment to AffineTextAttributes
│   ├── adapters/markdown/
│   │   ├── markdown.ts                         # +serialisers for highlight, comment, tag, wikilink, callout type
│   │   └── remark-plugins/remark-callout.ts    # extend: [!TYPE] + foldable suffix parsing
│   └── theme/css-variables.ts                  # WCAG AA audit + fix colour tokens
├── inlines/
│   ├── preset/src/
│   │   ├── markdown.ts                         # +HighlightMarkdown, +CommentMarkdown
│   │   └── keymap/bracket.ts                   # extend [[ ]] for wikilink input rule
│   └── tag/                                    # NEW package: TagInlineSpec
│       └── src/
│           ├── index.ts
│           ├── inline-spec.ts
│           ├── view.ts
│           └── store.ts
├── blocks/callout/src/
│   ├── configs/callout-types.ts                # NEW: type → icon/colour mapping
│   ├── callout-block.ts                        # +foldable UI, +type-driven icon/colour
│   └── callout-keymap.ts                       # +fold/unfold keybinding
└── model/src/blocks/callout/callout-model.ts   # +calloutType, +foldable, +folded props

packages/frontend/core/src/blocksuite/
├── block-suite-mode-switch/                    # extend: +source mode toggle
└── view-extensions/
    └── editor-config/                          # register TagInlineSpec
```

**Structure Decision**: Extend existing packages. One new package (`blocksuite/affine/inlines/tag/`) following the established inline package pattern (`link`, `footnote`, `reference`, `latex`).

---

## Phase 0: Research

**Status**: Complete — see [research.md](./research.md)

Key findings:

- Bold, italic, strikethrough, underline, inline code, inline LaTeX, GFM tables/tasks/footnotes/autolinks all already work
- Mermaid and KaTeX rendering already integrated
- **Gaps**: `==highlight==` shortcut, `%% comment %%`, wikilinks `[[...]]`, Obsidian callout types `[!TYPE]`, inline `#tags`, global source mode
- All gaps addressable within existing BlockSuite patterns; no new architectural primitives needed

---

## Phase 1: Design & Contracts

**Status**: Complete

### Data Model

See [data-model.md](./data-model.md)

New/extended schemas:

- `AffineTextAttributes` + `highlight` + `comment` inline attributes
- `CalloutBlockSchema` + `calloutType` + `foldable` + `folded` props
- New `TagDeltaAttributes` inline delta type
- Source mode as Jotai UI-only atom (not persisted)

### Interface Contracts

See [contracts/inline-extensions.md](./contracts/inline-extensions.md)

Contracts defined for:

1. `HighlightMarkdown` extension
2. `CommentMarkdown` extension
3. `WikilinkInputRule` + `WikilinkResolver`
4. `TagInlineSpec`
5. `CalloutTypeConfig` + `getCalloutTypeConfig()`
6. Source mode toggle transition contract
7. Markdown adapter export serialisation rules

### Quickstart

See [quickstart.md](./quickstart.md)

---

## Phase 2: Tasks

**Status**: To be generated — run `/speckit.tasks`

Implementation phases:

| Phase                 | Stories            | Unblocked                            | Key deliverables                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Inline Formatting | S1 (P1)            | Yes                                  | `HighlightMarkdown`, `CommentMarkdown`, `AffineTextAttributes` update                                                                                                                                                                                                                                                                                                                                                                                       |
| B — Wikilinks         | S2 (P1)            | Yes                                  | Wikilink input rule, paste adapter, page creation on click                                                                                                                                                                                                                                                                                                                                                                                                  |
| C — Code/Mermaid/Math | S3, S4, S5 (P1/P2) | Yes (already exists — verify + wire) | Shiki language audit, mermaid error state, KaTeX inline                                                                                                                                                                                                                                                                                                                                                                                                     |
| D — Tables            | S6 (P2)            | Yes (already exists — verify)        | GFM table paste, alignment, row/col edit                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E — Callout Types     | S7 (P2)            | Yes                                  | `calloutType` schema, remark-callout extension, foldable UI                                                                                                                                                                                                                                                                                                                                                                                                 |
| F — Task Lists        | S8 (P2)            | Yes (already exists — verify)        | Any-char checkbox, export fidelity                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G — Source Mode       | S1/clarification   | Yes                                  | Mode toggle, serialise/parse, round-trip test                                                                                                                                                                                                                                                                                                                                                                                                               |
| H — Toggle Sections   | S9 (P3)            | Yes (partially exists)               | `<details>` paste handling                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| I — Footnotes         | S10 (P3)           | Yes (already exists — verify)        | Inline footnote `^[...]`, back-link navigation                                                                                                                                                                                                                                                                                                                                                                                                              |
| J — Comments          | S11 (P3)           | Yes                                  | `comment` attribute, `%%` shortcut, source mode visibility                                                                                                                                                                                                                                                                                                                                                                                                  |
| K — Autolinks         | S12 (P3)           | Yes (already exists — verify)        | URL + email autolink on space/enter                                                                                                                                                                                                                                                                                                                                                                                                                         |
| L — Tags              | S13 (P3)           | Yes                                  | `TagInlineSpec` package, search integration                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M — Accessibility     | All                | After A–L                            | WCAG AA audit (text + non-text contrast), keyboard nav (FR-048/FR-049), ARIA states (FR-050), aria-hidden comments (FR-051), footnote labels (FR-052), reduced-motion (FR-053), error panel non-colour indicator (FR-054), touch targets (FR-055). **Risk**: accessibility is sequenced last but FR-049–FR-055 introduce ARIA/DOM requirements on elements built in Phases A–L; plan for a review pass on each phase's PR to catch structural issues early. |
| N — Export Fidelity   | All                | After A–L                            | Round-trip tests for all new types                                                                                                                                                                                                                                                                                                                                                                                                                          |
