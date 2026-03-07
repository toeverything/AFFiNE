# Round-Trip Fidelity Requirements Checklist: Editor Markdown & Rich Text Parity

**Purpose**: Validate that the export and re-import requirements are complete, unambiguous, and measurable for every formatting type — not whether the implementation preserves content correctly. Each item is a unit test for the English in the spec.
**Created**: 2026-03-07
**Feature**: [spec.md](../spec.md) | [contracts/inline-extensions.md](../contracts/inline-extensions.md)

---

## Requirement Completeness

- [x] CHK001 — Are round-trip requirements defined for every one of the 13 user story formatting types — specifically, does SC-008 enumerate all types explicitly, or does "all 13" leave ambiguity about which 13 are meant? [Completeness, Spec §SC-008]
- [x] CHK002 — Is there a round-trip requirement for the source mode itself (FR-043–FR-045) — specifically, is "content produced in source mode then viewed in live preview then re-exported" covered by SC-008, or only "content produced in live preview"? [Completeness, Spec §SC-008, FR-043, Gap]
- [x] CHK003 — Is the round-trip requirement for inline footnotes (`^[text]`, FR-034a) fully specified — the spec states they export as reference-style (`[^1]:`), but is the re-import direction also required (i.e., must `[^1]:` round-trip back to a functional footnote on import)? [Completeness, Spec §FR-034a, FR-042]
- [x] CHK004 — Are round-trip requirements defined for block quotes (FR-039) and horizontal rules (FR-040) — these are in the spec as FRs but are not mentioned in SC-008's enumeration or in the FR-042 export contract? [Completeness, Spec §FR-039, FR-040, FR-042, Gap]
- [x] CHK005 — Is there a round-trip requirement for nested callouts (FR-028b) — the spec defines nested callout support, but does FR-042/SC-008 specify how nested callout markdown (`> [!TYPE]\n> > [!TYPE2]\n> > content`) is expected to survive a cycle? [Completeness, Spec §FR-028b, FR-042, Gap]

## Requirement Clarity

- [x] CHK006 — Is the "import" direction of the round-trip (SC-008: "re-imported") defined — specifically, does re-import mean paste from clipboard, use a file-import command, or both? The import mechanism determines which code path is tested. [Clarity, Spec §SC-008]
- [x] CHK007 — Is "no visible degradation" in SC-008 defined with enough precision to distinguish acceptable normalisation from unacceptable loss — specifically, is the enumerated tolerance (trailing newlines, blank-line count) the complete and exhaustive list, or an illustrative subset? [Clarity, Spec §SC-008]
- [x] CHK008 — For wikilinks (FR-042: exported as `[[Page Name]]`), is the round-trip behaviour on import defined — does a re-imported `[[Page Name]]` undergo the same resolution process as a freshly typed wikilink, and must the resolved/unresolved state be preserved? [Clarity, Spec §FR-008, FR-042]
- [x] CHK009 — For tags (FR-042: exported as plain `#tag-name` text), is the round-trip import direction defined — does re-importing `#tag-name` as plain text re-create a styled tag element, or does it remain plain text after import? [Clarity, Spec §FR-038, FR-042]
- [x] CHK010 — Is the round-trip requirement for foldable callouts (FR-028/FR-028a: exported as `> [!TYPE]-` or `> [!TYPE]+`) fully specified for the folded/expanded _state_ — must the collapsed/expanded state be preserved on re-import, or only the foldability capability? [Clarity, Spec §FR-028, FR-028a, FR-042]
- [x] CHK011 — Is the export format for `comment` (FR-042: `%%text%%`) defined for multi-line block comments — specifically, does a multi-line comment export as `%%\ntext\n%%` (block form) or as a single-line `%%text%%` with embedded newlines? [Clarity, Spec §FR-036, FR-042]
- [x] CHK012 — Is the export format for `highlight` (FR-042: `==text==`) defined for highlighted text that spans multiple words with mixed formatting — e.g., `==**bold highlight**==`; does the export produce `==**bold highlight**==` or `**==bold highlight==**`? [Clarity, Spec §FR-005, FR-042, Gap]

## Requirement Consistency

- [x] CHK013 — Is the SC-008 tolerance (trailing newlines, blank-line normalisation) consistent with the export serialisers defined in FR-042 — specifically, do the serialisers for callouts, wikilinks, and comments produce exactly one blank line between blocks, or is output normalisation undefined? [Consistency, Spec §SC-008, FR-042]
- [x] CHK014 — Is the round-trip requirement (SC-008) consistent with the source mode round-trip contract (contracts/inline-extensions.md §6) — the contracts doc states "all formatting types in spec MUST survive a live-preview → source → live-preview cycle"; do these two requirements impose the same or different obligations? [Consistency, Spec §SC-008, contracts §6]
- [x] CHK015 — Is the FR-042 export contract for wikilink aliases (`[[Page Name|Alias]]`) consistent with SC-008 — if a document has an aliased wikilink, must the alias survive a full export-import cycle, or is the alias considered presentation-only and permitted to collapse to the target title? [Consistency, Spec §FR-009, FR-042, SC-008]
- [x] CHK016 — Is the requirement for task list checkbox state (`[x]` vs `[ ]`) on round-trip consistent with FR-025a — FR-025a says non-standard characters export as `[x]`, but SC-008 requires "no visible degradation"; is converting `[?]` to `[x]` on export considered degradation or acceptable normalisation? [Consistency, Spec §FR-025a, SC-008]

## Acceptance Criteria Quality

- [x] CHK017 — Is SC-008 measurable for the "verify + wire" types (code blocks, mermaid, math, tables, task lists, footnotes, autolinks) — does "retains all formatting" define a specific observable property for each type (e.g., for code blocks: language identifier preserved, content byte-for-byte identical)? [Measurability, Spec §SC-008]
- [x] CHK018 — Is the round-trip requirement for mermaid diagrams (FR-015) measurable — does "mermaid source preserved in export" (S4 scenario 4) define whether the preserved source must be syntactically identical to the original, or only functionally equivalent (same rendered output)? [Measurability, Spec §FR-015, S4]
- [x] CHK019 — Is the round-trip requirement for math expressions (FR-016–FR-019) measurable — the spec allows `$$...$$` and ` ```math ` to normalise to the same internal form; must the export preserve the original entry-point syntax (i.e., `$$` → `$$` on re-export), or may it normalise to a single canonical form? [Measurability, Spec §FR-016, FR-019, FR-042]
- [x] CHK020 — Is there a measurable time-bound or performance requirement for the export operation that underlies SC-008 — the plan states "serialisation/deserialisation completes within 500ms for a 1000-block document" (plan.md §Technical Context); is this a requirement or an aspiration, and is it in the spec? [Measurability, Spec §SC-008, plan.md §Technical Context, Gap]

## Scenario Coverage

- [x] CHK021 — Is the round-trip requirement defined for the "partial document" case — e.g., copying a subset of blocks from AFFiNE, pasting into another editor, then re-pasting into AFFiNE; or is SC-008 limited to whole-document export-import only? [Coverage, Spec §SC-008, Gap]
- [x] CHK022 — Is the round-trip requirement defined for documents with mixed formatting — e.g., a document containing both a highlight and a comment within the same paragraph; must both attributes survive independently, or only if they are on separate spans? [Coverage, Spec §FR-005, FR-036, SC-008, Gap]
- [x] CHK023 — Are round-trip requirements specified for the edge case of a wikilink inside a callout inside a code-fenced block in source mode — i.e., are there any block-nesting combinations for which round-trip fidelity is explicitly relaxed or undefined? [Coverage, Edge Case, Gap]
- [x] CHK024 — Is the round-trip requirement for collapsed sections (`<details><summary>`, FR-031) defined — the spec states `<details>` is stored as a toggle block; what does it export as (markdown `<details>` HTML or a GFM alternative), and must re-import reconstruct the toggle block? [Coverage, Spec §FR-031, FR-042, Gap]
- [x] CHK025 — Is the round-trip requirement for heading levels (FR-032) defined in FR-042 — the export contract does not explicitly mention headings; are they assumed to export as standard ATX `#` headings and re-import without degradation? [Coverage, Spec §FR-032, FR-042, Gap]

## Edge Case Coverage

- [x] CHK026 — Is the round-trip behaviour defined for a document that is exported to markdown and then imported into a different markdown-aware tool (Obsidian, GitHub) rather than back into AFFiNE — or is SC-008 exclusively an AFFiNE→AFFiNE requirement? [Edge Case, Spec §SC-008]
- [x] CHK027 — Are round-trip requirements defined for empty or near-empty blocks — e.g., a callout with no body text, a task list with no items, or a footnote definition with no content; must these degenerate cases survive export without collapsing or being omitted? [Edge Case, Spec §SC-008, Gap]
- [x] CHK028 — Is the round-trip requirement defined for very long documents — e.g., does SC-008 or plan.md's 1000-block performance target bound also apply as a correctness guarantee (not just a speed guarantee) for large documents? [Edge Case, Spec §SC-008, plan.md §Technical Context]
- [x] CHK029 — Is the round-trip requirement defined for content containing characters that conflict with markdown delimiters — e.g., a wikilink whose target title contains `|`, `[`, or `]`; or a tag name containing `/` at multiple levels; are these serialisation-conflict cases addressed? [Edge Case, Spec §FR-008, FR-038, FR-042, Gap]

## Dependencies & Assumptions

- [x] CHK030 — Is it documented which direction is the authoritative "source of truth" for round-trip — does AFFiNE's internal CRDT representation define the canonical state, or does the exported markdown define it; and what is the tiebreaker when they diverge after a cycle? [Assumption, Spec §SC-008, Gap]
- [x] CHK031 — Is the dependency on the existing markdown import adapter (used by SC-008's re-import direction) documented as an assumption — specifically, the assumption that the import adapter handles all FR-042 syntax types on input as well as output? [Dependency, Spec §SC-008, FR-042, Assumption]

## Notes

- All 31 items resolved 2026-03-07 by rewriting FR-042 in spec.md and adding 13 round-trip assumptions to spec.md Assumptions section
- Key decisions recorded: CRDT is canonical source of truth (CHK030); tags stay plain text on re-import (CHK009); foldable state not required to survive round-trip (CHK010); `[?]`→`[x]` is tolerated normalisation (CHK016); toggle exports as `<details>` and re-imports as toggle block (CHK024); partial-document round-trip is out of SC-008 scope (CHK021); 500ms is aspiration not correctness gate (CHK020); mermaid must be syntactically identical (CHK018); math may normalise to `$$` canonical form (CHK019)
- Gate: Review before Phase N (Export Fidelity) begins and before any Phase A–L PR touches FR-042 serialisers
