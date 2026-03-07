# Tasks: Editor Markdown & Rich Text Parity

**Input**: `specs/001-editor-markdown-parity/`
**Branch**: `001-editor-markdown-parity`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/inline-extensions.md](./contracts/inline-extensions.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelisable with other [P] tasks in the same phase (different files, no shared write targets)
- **[Story]**: User story label from spec.md (US1–US13)
- All paths are repo-root-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm dev environment and register the one new package. All other phases extend existing packages — no project scaffolding required beyond this.

- [x] T001 Confirm Yarn 4 + Node 20 environment is active (`corepack enable && yarn install`)
- [x] T002 Create new package directory `blocksuite/affine/inlines/tag/src/` with `package.json` following the pattern of `blocksuite/affine/inlines/reference/package.json`
- [x] T003 [P] Add `@blocksuite/affine-inline-tag` to workspace exports in `blocksuite/affine/inlines/tag/package.json` and register as workspace dependency in root `package.json`
- [x] T004 [P] Add `blocksuite/affine/blocks/callout/src/configs/` directory (empty, for callout type config added in Phase E)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and type additions that are compile-time dependencies for all subsequent phases. No user story can be implemented until these type definitions exist.

**⚠️ CRITICAL**: All Phase 3+ tasks depend on T005 and T006. Run typecheck after each task.

- [x] T005 Add `highlight?: string | null` and `comment?: true | null` to `AffineTextAttributes` in `blocksuite/affine/shared/src/types/index.ts` per data-model.md §1
- [x] T006 [P] Add `calloutType?: CalloutType`, `foldable?: boolean`, `folded?: boolean` to `CalloutProps` and define `CalloutType` union in `blocksuite/affine/model/src/blocks/callout/callout-model.ts` per data-model.md §3
- [x] T007 [P] Run `yarn typecheck` across the monorepo and fix any type errors introduced by T005/T006 before proceeding

**Checkpoint**: `yarn typecheck` passes — all phases can now begin in parallel per their priority order.

---

## Phase 3: User Story 1 — Inline Text Formatting (Priority: P1) 🎯 MVP

**Goal**: `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `` `code` `` all render as formatted text on Space trigger in live preview. Keyboard shortcuts work on selection.

**Independent Test**: Open a blank document, type each inline sequence, press Space after each, and confirm styled rendering with delimiters consumed. No other phases required.

- [x] T008 [US1] Implement `HighlightMarkdown` `InlineMarkdownExtension` in `blocksuite/affine/inlines/preset/src/markdown.ts` — pattern `/.*==([^\s=][^=]*[^\s=])==\s$|.*==([^\s=])==\s$/`, applies `{ highlight: 'var(--affine-highlight-yellow)' }` on Space trigger, per contracts §1
- [x] T009 [US1] Register `HighlightMarkdown` in the `MarkdownExtensions` array in `blocksuite/affine/inlines/preset/src/markdown.ts`
- [x] T010 [P] [US1] Add highlight renderer in live preview: span with CSS background matching the `highlight` token value, in the relevant inline renderer file (follow the `bold`/`italic` renderer pattern in `blocksuite/affine/inlines/preset/src/`)
- [x] T011 [P] [US1] Verify that existing bold (`**`), italic (`*`), strikethrough (`~~`), and inline code (`` ` ``) shortcuts are wired and passing — confirm by running `yarn workspace @blocksuite/affine-inline-preset vitest` (fix if broken, no new code if already passing)
- [x] T012 [US1] Write Vitest unit tests for `HighlightMarkdown` in `blocksuite/affine/inlines/preset/src/__tests__/highlight.spec.ts` — cover: trigger fires on Space, does not fire on Enter, nested `==` is treated as plain text, default colour token applied

---

## Phase 4: User Story 2 — Obsidian Wikilinks (Priority: P1)

**Goal**: `[[Page Name]]`, `[[Page Name|Alias]]`, `[[Page Name#Heading]]`, `[[Note#^block-id]]` auto-convert to navigable links on `]]` typed and on paste. Unresolved links show dashed underline; clicking creates the page.

**Independent Test**: Type `[[My Note]]` in a document. Confirm it renders as a link. Independently testable from Phase 3.

- [x] T013 [US2] Extend `blocksuite/affine/inlines/preset/src/keymap/bracket.ts` to detect `[[title]]` completion on `]]` typed and emit a reference inline delta `{ reference: { type: 'LinkedPage', title, pageId: '' } }` per contracts §3 and data-model.md §2
- [x] T014 [US2] Add alias parsing: `[[title|display]]` → `insert: display`, `reference.title: title` in `blocksuite/affine/inlines/preset/src/keymap/bracket.ts`
- [x] T015 [P] [US2] Add heading anchor parsing: `[[title#Heading]]` → `reference.params.anchor` and block-ref parsing: `[[title#^id]]` → `reference.params.blockIds` in `blocksuite/affine/inlines/preset/src/keymap/bracket.ts`
- [x] T016 [US2] Implement paste-time wikilink recognition via `wikilink-preprocessor.ts` + `wikilink-delta-converter.ts` in `blocksuite/affine/inlines/preset/src/adapters/markdown/`; registered via `InlineAdapterExtensions`
- [x] T017 [US2] Implement case-insensitive first-match lookup via `workspace.meta.docMetas`; CSS class `affine-reference--unresolved` (dashed underline) when `pageId === ''`
- [x] T018 [P] [US2] Implement unresolved-link click handler: re-resolve first, create page if still unresolved, update delta `pageId`, navigate — in `blocksuite/affine/inlines/reference/src/reference-node/reference-node.ts`
- [x] T019 [P] [US2] Add `affine-reference--unresolved` CSS rule (dashed underline, text-decoration) in `blocksuite/affine/inlines/reference/src/reference-node/reference-node.ts` static styles
- [x] T020 [US2] Write Playwright E2E test in `tests/e2e/` (or existing e2e directory) covering: type `[[New Page]]` → unresolved render → click → page created → link resolved

---

## Phase 5: User Story 3 — Code Blocks with Syntax Highlighting (Priority: P1)

**Goal**: Fenced code blocks with language identifiers render with Shiki syntax highlighting for the 12 required languages. Unrecognised language → plain monospace, no crash.

**Independent Test**: Paste ` ```python\nprint("hello")\n``` `. Confirm syntax-highlighted output. Independently testable.

- [x] T021 [US3] Audit Shiki language support in the existing code block implementation (`packages/frontend/core/src/blocksuite/view-extensions/code-block-preview/` or equivalent) — confirm all 12 languages (JavaScript, TypeScript, Python, Go, Rust, Bash, JSON, YAML, HTML, CSS, SQL, Markdown) are registered per FR-014; add any missing language bundles
- [x] T022 [P] [US3] Confirm that fenced code blocks with an unrecognised language identifier fall back to plain monospace without error (add defensive handling if not already present in the code block renderer)
- [x] T023 [P] [US3] Confirm the language selector UI updates highlighting immediately on change (verify in `blocksuite/affine/blocks/code/src/` — no new code if already working)

---

## Phase 6: User Story 4 — Mermaid Diagrams (Priority: P2)

**Goal**: ` ```mermaid ` blocks render as visual diagrams for all 6 supported types. Invalid syntax shows user-readable error with red border, not blank or crash.

**Independent Test**: Create a ` ```mermaid ` block with a simple flowchart. Confirm diagram renders. Independently testable after Phase 5.

- [x] T024 [US4] Verify Mermaid rendering is active for all 6 diagram types (flowchart, sequence, class, state, gantt, pie) in `packages/frontend/core/src/blocksuite/view-extensions/code-block-preview/` — add any missing diagram type registrations
- [x] T025 [US4] Implement the error state for invalid Mermaid syntax per FR-017: display user-readable parse error text inside a styled panel with a red/error border colour and an error icon (FR-054 non-colour indicator) — in the mermaid preview renderer
- [x] T026 [P] [US4] Confirm mermaid source is preserved byte-for-byte in markdown export (FR-042 + round-trip assumption: syntactically identical); add serialiser assertion if not already tested

---

## Phase 7: User Story 5 — Math Expressions (Priority: P2)

**Goal**: `$...$` inline math and `$$...$$` / ` ```math ` display math render as typeset KaTeX output. Invalid LaTeX shows raw source + KaTeX error message.

**Independent Test**: Type `$x^2$` inline and `$$\frac{a}{b}$$` as a block. Confirm typeset rendering. Independently testable.

- [x] T027 [US5] Verify `$...$` inline math (FR-018) is wired in the inline renderer — confirm `affine:latex` inline or equivalent handles `$...$` delimiters; add if missing
- [x] T028 [P] [US5] Verify `$$...$$` display math (FR-019) and ` ```math ` fenced blocks (FR-016) both render as centred display math — confirm both entry points produce the same KaTeX output; normalise to single internal form if not already done
- [x] T029 [US5] Implement the error state for invalid LaTeX per FR-017: show raw LaTeX source alongside KaTeX error message (not a blank view); add error icon per FR-054 — in the math renderer

---

## Phase 8: User Story 6 — Tables (Priority: P2)

**Goal**: GFM pipe tables paste and render as formatted editable tables with correct column alignment. Malformed tables render best-effort (no crash).

**Independent Test**: Paste a GFM table with all three alignment types. Confirm visual table with correct alignment. Independently testable.

- [x] T030 [US6] Verify GFM pipe-table paste produces an `affine:table` block with correct column alignment (`:---`, `:---:`, `---:`) — audit `blocksuite/affine/shared/src/adapters/markdown/` for alignment parser; fix if alignment is dropped
- [x] T031 [P] [US6] Verify row and column add/remove is supported in live preview table editing (FR-022) in `blocksuite/affine/blocks/table/src/` — confirm UI controls exist; add if missing
- [x] T032 [P] [US6] Verify malformed table paste (missing pipes, mismatched columns) renders best-effort per the malformed table assumption: no crash, at least first complete row visible — add defensive handling in the table parser if needed

---

## Phase 9: User Story 7 — Callout Types / Admonitions (Priority: P2)

**Goal**: `> [!TYPE]` renders as a styled callout with type-specific icon and colour. Foldable `-`/`+` suffix works. Nested callouts render correctly.

**Independent Test**: Type `> [!WARNING]` followed by content. Confirm styled warning callout with icon. Independently testable.

- [x] T033 [US7] Create `blocksuite/affine/blocks/callout/src/configs/callout-types.ts` implementing `CALLOUT_TYPE_CONFIGS` and `getCalloutTypeConfig()` per contracts §5 — 11 canonical types with full alias map, icons, colour tokens, and locale-aware labels
- [x] T034 [US7] Extend `blocksuite/affine/shared/src/adapters/markdown/remark-plugins/remark-callout.ts` to parse `> [!TYPE]`, `> [!TYPE]-`, `> [!TYPE]+` syntax, set `calloutType`, `foldable`, `folded` on the callout block, fall back to "note" for unknown types per contracts §5
- [x] T035 [US7] Update callout block renderer in `blocksuite/affine/blocks/callout/src/callout-block.ts` to apply icon and background colour from `getCalloutTypeConfig(calloutType)` when `calloutType` is set; fall back to existing appearance when `calloutType` is null
- [x] T036 [P] [US7] Implement foldable callout fold/expand toggle in `blocksuite/affine/blocks/callout/src/callout-block.ts`: toggle button in callout header, `folded` CRDT prop toggled on click, CSS transition for expand/collapse; respect `prefers-reduced-motion` per FR-053
- [x] T037 [P] [US7] Add `aria-expanded` to the fold/expand toggle control per FR-050a; add `aria-label` from `calloutTypeConfig.label` to the callout icon per FR-047
- [x] T038 [P] [US7] Add callout type serialiser to markdown adapter in `blocksuite/affine/shared/src/adapters/markdown/markdown.ts`: `> [!TYPE]\n> content`, foldable `-`/`+` suffix, nested callout Obsidian form per FR-042
- [x] T039 [P] [US7] Verify nested callout rendering (FR-028b) — paste `> [!NOTE]\n> > [!WARNING]\n> > nested content` and confirm both levels render with correct styling; add recursive renderer handling if not present in `blocksuite/affine/blocks/callout/src/`
- [x] T040 [US7] Verify WCAG AA contrast for all 11 callout colour tokens in both light and dark themes per FR-046 — audit `blocksuite/affine/shared/src/theme/css-variables.ts`; fix any failing tokens

---

## Phase 10: User Story 8 — Task Lists (Priority: P2)

**Goal**: `- [ ] item` / `- [x] item` render as interactive checkboxes. Non-standard chars (`[?]`, `[-]`) treated as checked. Export normalises to `[x]`.

**Independent Test**: Type `- [ ] Buy milk`. Confirm interactive checkbox. Click to check. Independently testable.

- [x] T041 [US8] Verify `- [ ] item` and `- [x] item` render as interactive checkboxes in `blocksuite/affine/blocks/list/src/` (FR-023/FR-024) — confirm and fix if broken
- [x] T042 [US8] Implement non-standard checkbox character handling per FR-025a: any non-space char inside `[ ]` is treated as checked state — add to the list block renderer or markdown parser
- [x] T043 [P] [US8] Add `[x]` normalisation to markdown export for non-standard marked items per FR-025a in `blocksuite/affine/shared/src/adapters/markdown/markdown.ts`
- [x] T044 [P] [US8] Verify checkbox state persists via CRDT on click (FR-025) — confirm `checked` prop is written to y-octo on toggle

---

## Phase 11: User Story 9 — Toggle / Collapsed Sections (Priority: P3)

**Goal**: `<details><summary>` paste produces a collapsible toggle block. Toggle blocks are creatable via slash command. Content collapses/expands on click.

**Independent Test**: Paste `<details><summary>Title</summary>Body</details>`. Confirm collapsible section. Independently testable.

- [x] T045 [US9] Implement `<details><summary>` HTML paste handler in the HTML import adapter (Notion paste path) — converts to AFFiNE toggle block with `<summary>` content as title and inner content as body per FR-031 and the HTML import adapter assumption
- [x] T046 [P] [US9] Verify toggle/collapsible block slash-command creation (FR-030) is present in the slash command registry in `packages/frontend/core/src/blocksuite/` — add if missing
- [x] T047 [P] [US9] Add `<details><summary>Title</summary>\nBody\n</details>` serialiser to markdown adapter in `blocksuite/affine/shared/src/adapters/markdown/markdown.ts` per FR-042; verify re-import reconstructs toggle block

---

## Phase 12: User Story 10 — Footnotes (Priority: P3)

**Goal**: `[^1]` reference + `[^1]: text` definition render as superscript with navigation. Inline `^[text]` supported. Accessible names on superscript links.

**Independent Test**: Add `[^1]` inline and `[^1]: Source` at bottom. Confirm superscript and navigation. Independently testable.

- [x] T048 [US10] Verify `[^label]` reference + `[^label]: definition` footnote pair renders as superscript linked to definition (FR-034) in `blocksuite/affine/inlines/footnote/src/` — fix if broken
- [x] T049 [US10] Implement inline footnote `^[text]` parsing per FR-034a in the markdown import adapter — converts to reference-style `[^N]` + definition at document bottom; verify in `blocksuite/affine/shared/src/adapters/markdown/`
- [x] T050 [P] [US10] Add `aria-label="Footnote N"` to footnote reference superscripts and `aria-label="Back to footnote N reference"` to back-links per FR-052 — in `blocksuite/affine/inlines/footnote/src/`
- [x] T051 [P] [US10] Verify click navigation: reference → definition and back-link → reference (FR-035) — confirm keyboard activation (Enter/Space) triggers same action per FR-048

---

## Phase 13: User Story 11 — Comments (Priority: P3)

**Goal**: `%% text %%` hidden in live preview; visible and editable in source mode with visible `%%` delimiters. Both single-line and multi-line block forms supported.

**Independent Test**: Type `%% private note %%`. Confirm invisible in live preview. Switch to source mode — confirm `%%` delimiters visible in grey/muted style. Independently testable.

- [x] T052 [US11] Implement `CommentMarkdown` `InlineMarkdownExtension` in `blocksuite/affine/inlines/preset/src/markdown.ts` — pattern for `%%text%%` inline and `%%\ntext\n%%` multi-line block form; applies `{ comment: true }` per contracts §2 (T005 already added the attribute)
- [x] T053 [US11] Register `CommentMarkdown` in the `MarkdownExtensions` array in `blocksuite/affine/inlines/preset/src/markdown.ts`
- [x] T054 [P] [US11] Add live preview renderer: `comment: true` spans render as zero-width invisible span with `aria-hidden="true"` per FR-036 and FR-051 — in the inline renderer
- [x] T055 [P] [US11] Add source mode renderer: `comment: true` spans render with visible `%%` delimiters styled as grey/muted text per FR-037 and contracts §2
- [x] T056 [P] [US11] Add comment serialiser to markdown adapter in `blocksuite/affine/shared/src/adapters/markdown/markdown.ts`: single-line → `%%text%%`, multi-line → `%%\ntext\n%%` per FR-042
- [x] T057 [US11] Write Vitest unit tests in `blocksuite/affine/inlines/preset/src/__tests__/comment.spec.ts` — cover: shortcut fires, live preview hides, source mode shows delimiters, paste-path recognition

---

## Phase 14: User Story 12 — Autolinks (Priority: P3)

**Goal**: Plain URLs typed or pasted convert to clickable hyperlinks on Space or Enter. Email addresses convert to `mailto:` links.

**Independent Test**: Paste `https://example.com`. Press Space. Confirm clickable link. Independently testable.

- [x] T058 [US12] Verify URL autolink fires on Space and Enter (both triggers) per FR-010 in `blocksuite/affine/inlines/preset/src/` — confirm and fix trigger if only one fires
- [x] T059 [P] [US12] Verify email address autolink produces `mailto:` link (FR-010) — add to autolink handler if missing
- [x] T060 [P] [US12] Verify pasted plain URLs are also autolinked (paste path per paste-path universality assumption) — confirm the markdown import adapter handles bare URLs on paste

---

## Phase 15: User Story 13 — Obsidian Tags (Priority: P3)

**Goal**: `#tag-name` inline renders as styled clickable tag element. Nested `#parent/child` supported. Case-insensitive matching; original casing displayed. Click opens search filtered to tag.

**Independent Test**: Type `This is #important`. Confirm `#important` renders as a distinct styled tag element (not a heading). Independently testable.

- [x] T061 [US13] Implement `TagInlineSpec` in `blocksuite/affine/inlines/tag/src/inline-spec.ts` — input rule recognising `#tag-name` (validation: `[a-zA-Z0-9_\-/]+`, ≥1 non-digit, no spaces), emitting `{ tag: { name: canonical } }` delta per contracts §4 and data-model.md §4
- [x] T062 [US13] Implement tag renderer in `blocksuite/affine/inlines/tag/src/view.ts` — `<span class="affine-tag" role="link" tabindex="0" aria-label="Tag: {name}">#{originalCasing}</span>` per contracts §4
- [x] T063 [P] [US13] Implement heading vs tag disambiguation in the input rule per FR-033/FR-038: `#` at column 0 + space = heading (not a tag); `#` at column 0 + non-space = tag candidate — in `blocksuite/affine/inlines/tag/src/inline-spec.ts`
- [x] T064 [P] [US13] Implement click / Enter / Space handler in `blocksuite/affine/inlines/tag/src/view.ts` — opens workspace search with query `tag:{canonical-name}` per FR-038c and contracts §4
- [x] T065 [P] [US13] Register `TagInlineSpec` in the view extensions registry — registered `TagViewExtension` in `blocksuite/affine/all/src/extensions/view.ts` and `TagInlineSpecExtension` in `DefaultInlineManagerExtension`
- [x] T066 [US13] Add tag serialiser to markdown adapter in `blocksuite/affine/inlines/tag/src/adapters/markdown/inline-delta.ts`: tag delta → plain `#tag-name` (canonical lowercase) text per FR-042
- [x] T067 [P] [US13] Write Vitest unit tests in `blocksuite/affine/inlines/preset/src/__tests__/tag.unit.spec.ts` — cover: basic tag recognition, heading disambiguation, nested tag `#parent/child`, case normalisation, canonical search query

---

## Phase 16: Source Mode (Cross-Cutting — ties to User Stories 1, 11, and round-trip)

**Goal**: Source mode toggle in toolbar serialises document to markdown for editing; switching back parses and applies mutations. Failed parse blocks exit with inline error.

**Independent Test**: Switch to source mode in a document with bold and highlight. Edit raw markdown. Switch back. Content preserved. Independently testable after Phase 3.

- [x] T068 Extend `EditorDisplayMode` type with `'source'` in `packages/frontend/core/src/blocksuite/block-suite-mode-switch/` if not already present per contracts §6
- [x] T069 Add source mode toggle button to editor toolbar in `packages/frontend/core/src/blocksuite/block-suite-mode-switch/` — accessible name `aria-label="Source mode"` / `"Live preview"`, visible focus indicator, per FR-044 and FR-049
- [x] T070 [P] Implement live-preview → source transition: serialise document via markdown adapter to string, display in editable code view (existing CodeBlock or textarea) per contracts §6 — in `packages/frontend/core/src/blocksuite/block-suite-mode-switch/`
- [x] T071 [P] Implement source → live-preview transition: parse markdown string via import adapter, diff against block tree, apply mutations per contracts §6 — in `packages/frontend/core/src/blocksuite/block-suite-mode-switch/`
- [x] T072 [P] Implement failed-parse error: display `role="alert"` inline error in source editor surface, block transition per FR-045 and FR-050c — in source mode view component
- [x] T073 Implement focus management on mode switch: keyboard focus moves to first editable position in newly active surface per FR-049 — in `packages/frontend/core/src/blocksuite/block-suite-mode-switch/`
- [x] T074 [P] Write Playwright E2E test: live preview → source mode → edit raw markdown → switch back → confirm content preserved (round-trip contract §6)

---

## Phase 17: Accessibility (Cross-Cutting — after Phases 3–16)

**Goal**: All new interactive elements pass WCAG 2.1 AA contrast (text + non-text), are keyboard navigable, and have correct ARIA semantics.

**Independent Test**: Run axe-core automated scan on a document containing all new element types; manual spot-check with NVDA+Firefox for wikilink, callout fold, footnote, tag, source mode toggle.

- [x] T075 Run axe-core automated accessibility audit against a document with all new element types (highlight, comment, wikilink, callout, tag, task list, footnote, source mode toggle) — fix any critical/serious violations per FR-046/SC-009
- [x] T076 [P] Audit WCAG AA text contrast (4.5:1 normal, 3:1 large/bold) for all new colour-bearing elements (callout backgrounds, highlight colours, tag styling, unresolved link) in `blocksuite/affine/shared/src/theme/css-variables.ts` in both light and dark themes per FR-046 and WCAG 2.1 AA scope assumption
- [x] T077 [P] Audit WCAG AA non-text contrast (3:1 per SC 1.4.11) for dashed underline of unresolved wikilinks, focus rings, and mermaid/math error panel borders per FR-046 — fix any failing tokens
- [x] T078 [P] Confirm keyboard operability for all interactive elements per FR-048: Tab/Shift+Tab focus, Enter/Space activation for task checkboxes, wikilinks, toggle sections, footnote links, tag elements, source mode toggle — add `tabindex="0"` and key handlers where missing
- [x] T079 [P] Verify `forced-colors: active` CSS media query — dashed underline expressed via `border`/`text-decoration` (not box-shadow), callout icon non-colour distinguisher survives forced colours per forced-colours assumption
- [x] T080 [P] Add touch target sizes (44×44px preferred, 24×24px floor) for checkboxes, source mode toggle, callout fold controls, and footnote links per FR-055
- [x] T081 [P] Manual spot-check with NVDA+Firefox: wikilink resolution announcement, callout fold/unfold `aria-expanded`, footnote `aria-label`, tag `aria-label`, source mode toggle accessible name, `role="alert"` parse error — per accessibility evaluation method assumption

---

## Phase 18: Export Fidelity & Round-Trip (after Phases 3–17)

**Goal**: All 13 user story formatting types survive a full export-import cycle with no visible degradation beyond the SC-008 tolerance (trailing newlines, blank-line count).

**Independent Test**: Author a document using all 13 formatting types. Export to markdown (clipboard). Paste back into a new AFFiNE document. Confirm structural fidelity per SC-008 per-type measurability assumption.

- [x] T082 Write Playwright E2E round-trip test for all 6 net-new types (highlight, comment, wikilink, callout type, tag, source mode output) — export to clipboard, paste into new doc, assert CRDT block types match original per SC-008
- [x] T083 [P] Write Playwright E2E round-trip test for the 7 "verify + wire" types (code blocks with language id, mermaid, math, tables, task lists, footnotes, autolinks) — assert per-type measurability: code content byte-for-byte, mermaid syntactically identical, math normalised to `$$`, table rows/alignment preserved, checkbox states correct, footnote labels preserved, URLs byte-for-byte
- [x] T084 [P] Write round-trip test for empty/degenerate blocks: callout with no body, task list with no items, footnote definition with no content — assert none are omitted on export per round-trip empty/degenerate blocks assumption
- [x] T085 [P] Write Vitest unit test for markdown adapter serialisation: highlight → `==text==`, comment multi-line → `%%\ntext\n%%`, wikilink alias → `[[Page Name|Alias]]`, callout foldable → `> [!TYPE]-`, toggle → `<details>`, heading → `# text` — in `blocksuite/affine/shared/src/adapters/markdown/__tests__/`

---

## Dependencies

```
Phase 1 (Setup)
  └── Phase 2 (Foundational: T005, T006, T007)
        ├── Phase 3  (US1 Inline Formatting — P1)
        ├── Phase 4  (US2 Wikilinks — P1)
        ├── Phase 5  (US3 Code Blocks — P1, verify only)
        ├── Phase 6  (US4 Mermaid — P2, verify only)
        ├── Phase 7  (US5 Math — P2, verify only)
        ├── Phase 8  (US6 Tables — P2, verify only)
        ├── Phase 9  (US7 Callouts — P2)
        ├── Phase 10 (US8 Task Lists — P2, verify only)
        ├── Phase 11 (US9 Toggle Sections — P3)
        ├── Phase 12 (US10 Footnotes — P3)
        ├── Phase 13 (US11 Comments — P3)
        ├── Phase 14 (US12 Autolinks — P3)
        ├── Phase 15 (US13 Tags — P3)
        └── Phase 16 (Source Mode — cross-cutting)
              └── Phases 3–16 complete
                    ├── Phase 17 (Accessibility — after A–L)
                    └── Phase 18 (Export Fidelity — after A–L)
```

**Phases 3–16 are independent of each other and may be implemented in parallel** (different files, different packages). The recommended order follows the plan.md priority table (P1 first, then P2, then P3).

---

## Parallel Execution Examples

### Within a single phase

Within Phase 9 (Callouts), T033 (create callout-types.ts) can run in parallel with T037 (aria attributes), T038 (serialiser), and T039 (nested callout verification) once T034 (remark-callout parsing) is complete and T035 (renderer) is underway.

### Across phases

After Phase 2 (Foundational), all of Phases 3, 4, 5, 6, 7, 8 may begin simultaneously — they touch separate files:

- Phase 3: `inlines/preset/src/markdown.ts`
- Phase 4: `inlines/preset/src/keymap/bracket.ts` + `adapters/markdown/markdown.ts`
- Phase 5: `view-extensions/code-block-preview/`
- Phase 6: same as Phase 5 (mermaid preview)
- Phase 7: `inlines/latex/` or `blocks/latex/`
- Phase 8: `blocks/table/`

### Sequential requirements

- Phase 16 (Source Mode) should start only after Phase 3 (Inline Formatting) and Phase 13 (Comments) are complete — the source mode must correctly display both highlight and comment delimiters.
- Phase 18 (Export Fidelity) requires all implementation phases complete — it is an integration validation layer, not an implementation phase.

---

## Implementation Strategy (MVP Increments)

| MVP Level        | Phases     | What it unlocks                                                             |
| ---------------- | ---------- | --------------------------------------------------------------------------- |
| **MVP 1**        | 1 + 2 + 3  | `==highlight==` shortcut working — most visible P1 gap                      |
| **MVP 2**        | + 4        | Obsidian wikilinks — critical migration path for Obsidian users             |
| **MVP 3**        | + 5, 6, 7  | Code/mermaid/math verified — unblocks technical documentation users         |
| **MVP 4**        | + 8, 9, 10 | Tables, callout types, task lists — full P2 coverage                        |
| **Full feature** | + 11–18    | Comments, autolinks, tags, source mode, footnotes, toggle, a11y, round-trip |

**Suggested MVP scope for first PR**: Phases 1–4 (inline formatting + wikilinks). These are the two P1 gaps that directly affect Obsidian migration fidelity and were identified as the top priority in spec §SC-002 and §SC-007.
