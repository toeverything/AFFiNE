# Implementation Readiness Checklist: Editor Markdown & Rich Text Parity

**Purpose**: Two-gate quality check on requirements — (1) pre-implementation readiness before starting each phase, and (2) pre-merge done-ness before opening a PR. Items validate requirement quality, completeness, and traceability — not implementation correctness.
**Created**: 2026-03-07
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [contracts/inline-extensions.md](../contracts/inline-extensions.md)

---

## GATE 1: Pre-Implementation Readiness

*Apply before starting each phase. Items test whether the requirements are clear and complete enough to begin coding.*

### Phase A — Inline Formatting (`HighlightMarkdown`, `CommentMarkdown`)

- [x] CHK001 — Is the `==highlight==` trigger sequence unambiguously specified — including whether it fires on Space, Enter, or both — matching the established pattern of other `InlineMarkdownExtension` rules? [Clarity, Spec §FR-005, contracts/inline-extensions.md §1]
- [x] CHK002 — Is the default highlight colour token specified (not just "a colour"), so it can be applied consistently across light and dark themes without an implementation decision? [Clarity, Spec §FR-005, contracts/inline-extensions.md §1]
- [x] CHK003 — Is the `comment` attribute's behaviour in source mode specified precisely enough to distinguish it from simply "showing raw text" — i.e., does the spec define what the delimiters (`%%`) look like in source mode? [Clarity, Spec §FR-037]
- [x] CHK004 — Are the `highlight` and `comment` additions to `AffineTextAttributes` documented in the data model with their type signatures, null semantics, and CRDT merge behaviour? [Completeness, data-model.md §1]
- [x] CHK005 — Is the `HighlightMarkdown` pattern's handling of nested or adjacent `==` characters (e.g., `==a==b==`) defined — either as in-scope or explicitly excluded? [Edge Case, Spec §FR-005]

### Phase B — Wikilinks

- [x] CHK006 — Does the spec unambiguously define what "auto-convert on input" means for wikilinks — specifically, whether conversion fires character-by-character, on `]]` typed, or on Space/Enter? [Clarity, Spec §FR-008, Spec §SC-007]
- [x] CHK007 — Is the wikilink resolution lookup strategy specified — case-sensitive or case-insensitive title match, first-match or error-on-duplicate? [Ambiguity, Spec §FR-008]
- [ ] CHK008 — Are the requirements for `[[title#Heading]]` and `[[title#^block-id]]` anchor variants traceable to distinct acceptance scenarios, or are they only in the FRs without a testable user story? [Traceability, Spec §FR-008a, FR-008b, S2]
- [x] CHK009 — Is the "unresolved visual state" described with enough specificity (e.g., a defined CSS class or token name) that two developers would produce the same visual result? [Clarity, Spec §FR-012]
- [x] CHK010 — Is the page-creation-on-click flow (FR-012a) specified for the case where a page with that title already exists by the time the user clicks — i.e., is there a race condition requirement? [Edge Case, Spec §FR-012a]
- [x] CHK011 — Is the paste-time wikilink conversion requirement (S2, scenario 3) traceable to a contract specifying which markdown adapter function is responsible? [Traceability, contracts/inline-extensions.md §3]

### Phase C — Code Blocks / Mermaid / Math (Verification Phases)

- [x] CHK012 — Are the 12 required languages for syntax highlighting individually enumerated in the spec, so "12 common languages" (SC-004) is objectively verifiable rather than subjective? [Measurability, Spec §FR-014, SC-004]
- [x] CHK013 — Is the mermaid error indicator requirement (FR-017) specified with enough detail — e.g., does it require a user-readable error message, a red border, or only "not a blank view"? [Clarity, Spec §FR-017]
- [x] CHK014 — Is the `$$...$$` display math requirement (FR-019) consistent with the `\`\`\`math\`` block requirement (FR-016) — are these two separate entry points with the same rendering outcome, or is one a subset of the other? [Consistency, Spec §FR-016, FR-018, FR-019]
- [ ] CHK015 — For the "verify + wire" phases (C, D, F, I, K), are the existing-feature acceptance scenarios in the spec sufficient to detect regressions, or do any scenarios only describe new-feature behaviour? [Coverage, Spec §S3–S5, S8, S10, S12]

### Phase D — Tables (Verification Phase)

- [x] CHK016 — Is the "best-effort rendering" requirement for malformed tables (S6 scenario 4) defined with a minimum standard — e.g., must all parseable columns be shown, or is any non-crash output acceptable? [Clarity, Spec §S6]
- [x] CHK017 — Does the spec define whether the row/column add-remove operations (FR-022) must work in both live preview and source mode, or only in live preview? [Completeness, Spec §FR-022]

### Phase E — Callout Types

- [x] CHK018 — Is the full list of supported callout type aliases (e.g., `hint`, `important` as aliases for `tip`) specified in the spec or contracts, so the implementation has a canonical reference? [Completeness, Spec §FR-027, contracts/inline-extensions.md §5]
- [x] CHK019 — Is the foldable `+` vs `-` suffix behaviour specified separately from the existing callout toggle — specifically, does `+` mean "expanded and collapsible" or "expanded and not collapsible"? [Clarity, Spec §FR-028a]
- [x] CHK020 — Is the nested callout requirement (FR-028b) specified with a maximum nesting depth, or is unlimited nesting assumed? [Ambiguity, Spec §FR-028b]
- [x] CHK021 — Is the `calloutType` schema addition documented with its CRDT implications — specifically, what happens to existing callout blocks that have no `calloutType` prop (schema migration / default)? [Completeness, data-model.md §3, Spec §FR-026]
- [x] CHK022 — Are requirements for the Notion-style callout slash-command entry (FR-029) specified to distinguish it from the Obsidian `> [!TYPE]` entry — e.g., does slash-command creation pre-select a default type? [Clarity, Spec §FR-029]

### Phase F — Task Lists (Verification Phase)

- [x] CHK023 — Is the "any non-space character as marked state" requirement (FR-025a) consistent with the export requirement (FR-042) — specifically, what does a `[?]` item serialise to in markdown export? [Consistency, Spec §FR-025a, FR-042]

### Phase G — Source Mode

- [x] CHK024 — Is the source mode toggle's location in the UI specified — e.g., editor toolbar, document settings, keyboard shortcut — or is placement left entirely to implementation discretion? [Completeness, Spec §FR-043, FR-044]
- [x] CHK025 — Is the failed-parse behaviour defined for source → live-preview transition — specifically, is "show error, do not exit source mode" the required behaviour, and is this documented in the spec (currently only in research.md)? [Completeness, Spec §FR-045, research.md §7]
- [x] CHK026 — Is the source mode requirement (FR-044) consistent with the comment visibility requirement (FR-037) — does "editable in source mode" imply the `%%` delimiters must be visible in source mode output? [Consistency, Spec §FR-037, FR-044]
- [x] CHK027 — Does the round-trip fidelity requirement (SC-008) specify a tolerance for whitespace or formatting normalisation — e.g., is a trailing newline change considered "degradation"? [Measurability, Spec §SC-008]

### Phase H — Toggle / Collapsed Sections (Verification Phase)

- [x] CHK028 — Is the requirement for `<details><summary>` paste handling (FR-031) consistent with the data model — specifically, is a `<details>` block stored as a toggle block in the CRDT or as raw HTML? [Consistency, Spec §FR-031, data-model.md]

### Phase I — Footnotes (Verification Phase)

- [x] CHK029 — Is the inline footnote syntax `^[Definition text]` (FR-034a) in scope for source mode round-trip, or does it convert to a reference-style footnote on export? [Completeness, Spec §FR-034a, FR-042]

### Phase J — Comments (Verification Phase / New)

- [x] CHK030 — Is the multi-line block comment form (`%%\ntext\n%%`) specified separately from the inline form (`%%text%%`), or does the spec treat both identically? [Completeness, Spec §FR-036]

### Phase K — Autolinks (Verification Phase)

- [x] CHK031 — Are the URL autolink trigger conditions precisely specified — must it fire on Space only, on Enter only, or on both — and is this consistent with the wikilink trigger (FR-008) and the highlight trigger (FR-005)? [Consistency, Spec §FR-010]

### Phase L — Tags

- [x] CHK032 — Is the tag disambiguation rule (heading vs tag) specified with enough precision for the boundary case of `#tag` typed on a blank line — does position-0 on any line make it a heading candidate, or only position-0 with a space after `#`? [Clarity, Spec §FR-033, FR-038]
- [x] CHK033 — Is the tag search integration requirement (FR-038c) specified with a concrete query format (e.g., `tag:name`) or left to the search infrastructure's existing API? [Ambiguity, Spec §FR-038c, contracts/inline-extensions.md §4]
- [x] CHK034 — Are requirements for tag serialisation on export (FR-042) defined — specifically, do tags export as plain `#tag-name` text, as markdown metadata, or as something else? [Completeness, Spec §FR-042, contracts/inline-extensions.md §7]
- [x] CHK035 — Is the tag case-insensitivity requirement (FR-038b) specified for the display layer — does `#Tag` render with its original casing or the canonical lowercased form? [Clarity, Spec §FR-038b]

### Phase M — Accessibility

- [x] CHK036 — Does the spec define WCAG 2.1 AA as a requirement against both light and dark themes independently, rather than a single combined check? [Completeness, Spec §SC-009]
- [x] CHK037 — Are the keyboard navigation requirements (FR-048) specified for each interactive element individually, or only as a blanket statement — and is the required key sequence (Tab, Enter, Space, Arrow) documented? [Clarity, Spec §FR-048]
- [x] CHK038 — Is "colour not used as sole distinguisher" (FR-047) specified with a concrete fallback — e.g., icon AND text label required, or icon alone sufficient? [Clarity, Spec §FR-047]

### Phase N — Export Fidelity

- [x] CHK039 — Does FR-042 ("all formatting MUST be represented correctly") define "correctly" — is the target the original Obsidian/GFM syntax for each type, or AFFiNE's own markdown dialect? [Clarity, Spec §FR-042]
- [x] CHK040 — Is the export fidelity requirement (SC-008) scoped to include all 13 user story types, or only the 6 net-new types — are the 8 "verify + wire" types also required to round-trip? [Completeness, Spec §SC-008]

---

## GATE 2: Pre-Merge Done-Ness

*Apply per-phase before opening a PR. Items test whether the requirements have been fully addressed and can be traced to completed work.*

### Spec-to-Implementation Traceability

- [ ] CHK041 — Does every FR in the spec (FR-001 through FR-048) have at least one corresponding Vitest unit test or Playwright E2E scenario that would fail if the requirement were absent? [Traceability, Constitution §IV]
- [ ] CHK042 — Are all acceptance scenarios from the 13 user stories traceable to a specific test file and test name, not just to a general test suite? [Traceability, Spec §S1–S13]
- [ ] CHK043 — For each of the 8 "verification" phases (C, D, F, I, K, H, and existing behaviour), is there evidence that the existing implementation was verified against the spec scenarios — not merely assumed to work? [Coverage, plan.md §Phase C, D, F, H, I, K]

### CRDT / Schema Correctness

- [x] CHK044 — Are all new CRDT-persisted attributes (`highlight`, `comment`, `calloutType`, `foldable`, `folded`, `tag.name`) defined with explicit default values that do not break existing documents missing those attributes? [Completeness, data-model.md §1–§4, Constitution §III]
- [x] CHK045 — Is there a defined schema migration or backwards-compatibility guarantee for the new `calloutType`, `foldable`, and `folded` props on existing callout blocks that were created before this feature? [Gap, data-model.md §3]
- [x] CHK046 — Is the CRDT merge behaviour for the `folded` boolean (toggled by click) documented — specifically, is last-write-wins the stated policy, or does it require a more specific CRDT type (e.g., LWW-register)? [Completeness, data-model.md §3, Spec §Clarifications]

### Contract-to-Spec Traceability

- [x] CHK047 — Does every FR in the Links section (FR-008 through FR-012a) map to at least one item in `contracts/inline-extensions.md §3` (WikilinkInputRule)? [Traceability, Spec §FR-008–012a, contracts §3]
- [x] CHK048 — Does every FR in the Tags section (FR-038 through FR-038c) map to a corresponding item in `contracts/inline-extensions.md §4` (TagInlineSpec)? [Traceability, Spec §FR-038–038c, contracts §4]
- [x] CHK049 — Does every FR in the Callouts section (FR-026 through FR-029) map to a corresponding item in `contracts/inline-extensions.md §5` (CalloutTypeConfig)? [Traceability, Spec §FR-026–029, contracts §5]
- [x] CHK050 — Does the markdown adapter export contract (contracts §7) cover all new serialisation rules — specifically, are `highlight`, `comment`, wikilink, tag, and all callout type variants listed? [Completeness, contracts §7, Spec §FR-042]
- [x] CHK051 — Are the source mode transition contracts (contracts §6) consistent with the spec requirements (FR-043–045) — specifically, does the contract's "failed parse: show error" match FR-045's data-loss prohibition? [Consistency, contracts §6, Spec §FR-045]

### Existing-Feature Verification Gaps

- [ ] CHK052 — For each "verify + wire" phase (C: code/mermaid/math, D: tables, F: task lists, I: footnotes, K: autolinks), is there a documented verification record — e.g., a test run result or confirmed acceptance scenario — not just an assumption from research.md? [Coverage, research.md §1]
- [ ] CHK053 — Is the mermaid diagram integration (Phase C) verified against all six required diagram types (flowchart, sequence, class, state, gantt, pie), not only the two shown in research examples? [Coverage, Spec §FR-015, SC-005]
- [ ] CHK054 — Is the GFM footnote inline variant `^[text]` (FR-034a) verified as working in the existing `blocksuite/affine/inlines/footnote/` implementation, or identified as a gap requiring new work? [Coverage, Spec §FR-034a, research.md §1]

### Constitution Compliance

- [ ] CHK055 — Does the new `tag` inline package (`blocksuite/affine/inlines/tag/`) have a documented ownership boundary — i.e., is it clear which team or module is responsible for maintaining it? [Completeness, Constitution §V]
- [ ] CHK056 — Are all tests required by this feature written to fail first (red) before passing (green) — is there a record of the red-phase run for new tests? [Constitution §IV]
- [ ] CHK057 — Is a `CHANGELOG.md` entry prepared for all user-visible changes introduced by this feature? [Constitution §Development Workflow §5]
- [ ] CHK058 — Does `yarn lint` and `yarn typecheck` pass with no suppressions added for this feature's code? [Constitution §Development Workflow §6]

## Notes

- Check items off as completed: `[x]`
- Gate 1 items should be reviewed at the start of each phase — block implementation if critical items (CRDT schema, contract traceability, ambiguity) are unresolved
- Gate 2 items should be reviewed by the PR author before requesting review and by the reviewer before approving
- Items marked `[Gap]` indicate requirements that may need to be written into the spec before the gate can pass
- Items marked `[Ambiguity]` indicate existing spec language that should be tightened before implementation
