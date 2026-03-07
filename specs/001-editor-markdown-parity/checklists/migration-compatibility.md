# Migration Compatibility Requirements Checklist: Editor Markdown & Rich Text Parity

**Purpose**: Validate that the import/paste requirements for each Obsidian construct and each Notion block type are complete, unambiguous, and measurable — not whether the implementation imports correctly. Each item is a unit test for the English in the spec. Structured as a compatibility matrix: per construct/block-type, does the spec define what "correctly imported" means?
**Created**: 2026-03-07
**Feature**: [spec.md](../spec.md) | [contracts/inline-extensions.md](../contracts/inline-extensions.md)

---

## Obsidian Constructs — Requirement Completeness

- [x] CHK001 — Is the import requirement for Obsidian bold/italic/strikethrough (`**bold**`, `*italic*`, `~~strike~~`) defined as covering the paste path (not only live-typing) — specifically, does FR-001–FR-004 apply when the user pastes Obsidian markdown, or only when they type the delimiters? [Completeness, Spec §FR-001–FR-004, Gap]
- [x] CHK002 — Is the import requirement for Obsidian highlight (`==text==`) defined for the paste path — FR-005 defines live-typing trigger as Space, but is there a requirement that `==text==` in pasted content is also recognised and rendered as highlighted? [Completeness, Spec §FR-005, Gap]
- [x] CHK003 — Is the import requirement for Obsidian wikilinks (`[[Page Name]]`) defined for both the typed and pasted paths — FR-008 says "auto-convert" but is the trigger for pasted content (`]]` not typed) explicitly stated, or only implied by S2 scenario 3? [Completeness, Spec §FR-008, S2]
- [x] CHK004 — Is the import requirement for Obsidian wikilink heading anchors (`[[Page Name#Heading]]`) fully specified for the paste path — FR-008a defines the form but does it state how a pasted anchor is resolved when the heading does not exist in the target page? [Completeness, Spec §FR-008a, Gap]
- [x] CHK005 — Is the import requirement for Obsidian block references (`[[Note#^block-id]]`) fully specified for the fall-back case — FR-008b says "falls back gracefully to a note-level link", but is the fallback visual state (resolved? unresolved? different style?) defined? [Completeness, Spec §FR-008b, Gap]
- [x] CHK006 — Is the import requirement for Obsidian inline footnotes (`^[text]`) defined as covering the paste path — FR-034a defines the syntax but only as an "entry point"; is there a requirement that pasted `^[text]` is recognised and rendered as a footnote, not left as raw text? [Completeness, Spec §FR-034a, Gap]
- [x] CHK007 — Is the import requirement for Obsidian comments (`%% text %%`) defined for the paste path — FR-036 defines the behaviour but does it explicitly cover paste input, or only live-typed content? [Completeness, Spec §FR-036, Gap]
- [x] CHK008 — Is the import requirement for Obsidian tags (`#tag-name`) defined for the paste path — FR-038 defines recognition rules but the trigger (typing vs. paste) is not explicit; is pasted `#tag` content recognised as a tag element, or only text typed inline? [Completeness, Spec §FR-038, Gap]
- [x] CHK009 — Is the import requirement for Obsidian callout syntax (`> [!TYPE]`) defined for both typed and pasted paths — FR-026 defines rendering but does it cover pasted Obsidian vault content where callouts appear as raw blockquote markdown? [Completeness, Spec §FR-026, Gap]
- [x] CHK010 — Is the import requirement for Obsidian foldable callout syntax (`> [!TYPE]-`, `> [!TYPE]+`) defined for the paste path — FR-028/FR-028a define rendering requirements but are these explicitly required to work when content is pasted, not only typed? [Completeness, Spec §FR-028, FR-028a, Gap]
- [x] CHK011 — Is the import requirement for Obsidian nested tags (`#parent/child`) defined — FR-038a requires nested tag support but does not specify the import/paste path; is a pasted `#parent/child` string recognised as a nested tag element? [Completeness, Spec §FR-038a, Gap]
- [x] CHK012 — Is there an import requirement for Obsidian embed syntax (`![[image.png]]`, `![[Note]]`) — the spec explicitly excludes embeds, but does it define what happens when pasted Obsidian content contains embed syntax (silently dropped, shown as plain text, or shown as an error)? [Completeness, Spec §Overview, Gap]
- [x] CHK013 — Is the import requirement for Obsidian `<details><summary>` HTML blocks (pasted from Obsidian exports) defined — FR-031 covers `<details>` paste behaviour, but is it clear this also applies to Obsidian-generated HTML, not only GitHub-flavored HTML? [Completeness, Spec §FR-031, Gap]

---

## Obsidian Constructs — Requirement Clarity

- [x] CHK014 — Is "pastes into AFFiNE and renders correctly" in SC-002 defined with enough precision to be measurable per Obsidian construct — does "renders correctly" mean the same CRDT block type as live-typing the same syntax, or only visually equivalent output? [Clarity, Spec §SC-002]
- [x] CHK015 — Is the "95% of common Obsidian constructs" threshold in SC-002 defined with an enumeration of which constructs constitute the 95% base — or is the set of "common constructs" left to implementer judgement? [Clarity, Spec §SC-002, Gap]
- [x] CHK016 — Is the import behaviour for Obsidian alias wikilinks (`[[Page Name|Alias]]`) on paste defined with enough clarity to distinguish: (a) alias preserved as display text, (b) alias discarded and page name used, (c) both stored in CRDT? FR-009 defines the syntax but not whether paste produces the same outcome as typing. [Clarity, Spec §FR-009, Gap]
- [x] CHK017 — Is the import behaviour for unrecognised Obsidian callout types (e.g. `> [!CUSTOM]`) on paste defined — FR-027 requires fallback to "note" config, but is this fallback also required for pasted content, or only for typed input? [Clarity, Spec §FR-027]
- [x] CHK018 — Is the import behaviour for Obsidian callout content that contains nested markdown (e.g. `> [!NOTE]` with a task list inside) defined — specifically, does the spec require that nested block-level elements inside a pasted callout are also parsed and rendered? [Clarity, Spec §FR-026, FR-028b, Gap]
- [x] CHK019 — Is the import behaviour for multi-line Obsidian comments (`%%\ntext\n%%`) on paste defined separately from single-line comments — FR-036 supports both forms, but is the paste-path requirement explicitly stated for the multi-line form? [Clarity, Spec §FR-036, Gap]

---

## Obsidian Constructs — Consistency

- [x] CHK020 — Are the import requirements for Obsidian inline formatting (FR-001–FR-007) consistent with the import requirements for Obsidian block elements (FR-026, FR-039, FR-040) — specifically, is the paste trigger (typed character vs. paste event) consistently defined across all Obsidian constructs, or ad-hoc per construct? [Consistency, Spec §FR-001–FR-007, FR-026, FR-039, FR-040]
- [x] CHK021 — Is the Obsidian tag recognition rule (FR-038: `#` at column 0 + non-space = tag) consistent with the Obsidian heading rule (FR-032: `#` + space = heading) when pasting content from Obsidian that has tags at line start — the spec defines the rule for live input; is it consistently applied to pasted content? [Consistency, Spec §FR-033, FR-038]
- [x] CHK022 — Is the requirement that wikilinks fire on `]]` typed (FR-008) consistent with the import requirement for pasted content — if the `]]` trigger is how live typing detects wikilinks, what is the equivalent trigger for pasted text, and is it specified? [Consistency, Spec §FR-008, SC-002, Gap]

---

## Notion Block Types — Requirement Completeness

- [x] CHK023 — Is the import requirement for Notion headings (H1, H2, H3) fully specified for the paste path — FR-032 requires ATX heading rendering but does it explicitly state that Notion-exported heading HTML (`<h1>`, `<h2>`, `<h3>`) is converted to AFFiNE heading blocks on paste? [Completeness, Spec §FR-032, Gap]
- [x] CHK024 — Is the import requirement for Notion bold/italic text defined for both markdown and HTML paste paths — Notion copies as rich HTML; does the spec require that `<strong>` and `<em>` in pasted HTML produce the same bold/italic attributes as `**bold**` markdown? [Completeness, Spec §FR-001, FR-002, Gap]
- [x] CHK025 — Is the import requirement for Notion toggle/collapsible blocks defined — SC-003 lists "toggles" as a Notion block type that should paste correctly, but does the spec define the exact mechanism (paste as HTML `<details>`, via FR-031, or a separate Notion-HTML-specific handler)? [Completeness, Spec §FR-030, FR-031, SC-003, Gap]
- [x] CHK026 — Is the import requirement for Notion callout blocks defined — SC-003 lists "callouts" but Notion exports callouts as div-with-icon HTML, not as `> [!TYPE]` Obsidian syntax; does the spec define a conversion requirement for Notion's HTML callout format? [Completeness, Spec §FR-026, SC-003, Gap]
- [x] CHK027 — Is the import requirement for Notion tables defined for the paste path — FR-020 requires GFM pipe-table rendering, but Notion exports tables as HTML `<table>`; does the spec require conversion of HTML tables to AFFiNE table blocks on paste? [Completeness, Spec §FR-020, SC-003, Gap]
- [x] CHK028 — Is the import requirement for Notion task lists / to-do blocks defined — FR-023/FR-024 define GFM `- [ ]` rendering; does the spec explicitly require that Notion's HTML checkbox format (`<input type="checkbox">`) is also recognised and converted on paste? [Completeness, Spec §FR-023, FR-024, SC-003, Gap]
- [x] CHK029 — Is the import requirement for Notion code blocks defined for the paste path — FR-013/FR-014 define fenced code block rendering; does the spec require that Notion's HTML `<code>` or exported ` ```lang ` format pastes as an AFFiNE code block with the language identifier preserved? [Completeness, Spec §FR-013, FR-014, SC-003, Gap]
- [x] CHK030 — Is the import requirement for Notion quote blocks defined — FR-039 requires block quote rendering; does the spec require that Notion-exported blockquote HTML (`<blockquote>`) is treated the same as GFM `> text` on paste? [Completeness, Spec §FR-039, SC-003, Gap]
- [x] CHK031 — Is the import requirement for Notion dividers / horizontal rules defined — FR-040 requires HR rendering; does the spec require that Notion-exported `<hr>` HTML is converted to a horizontal rule on paste? [Completeness, Spec §FR-040, SC-003, Gap]
- [x] CHK032 — Is the import requirement for Notion numbered lists defined — FR-041 requires ordered list rendering; does the spec require that Notion's ordered list HTML (`<ol><li>`) is recognised and converted to a numbered list block on paste? [Completeness, Spec §FR-041, SC-003, Gap]
- [x] CHK033 — Is the import requirement for Notion inline code (`<code>` spans) defined — FR-006 requires inline code rendering; does the spec require that Notion-exported HTML inline code elements are converted to AFFiNE inline code attributes on paste? [Completeness, Spec §FR-006, SC-003, Gap]

---

## Notion Block Types — Requirement Clarity

- [x] CHK034 — Is "renders correctly for at least 90% of common Notion block types" in SC-003 defined with an enumeration of which block types constitute the 90% base — or is "common Notion block types" left to implementer judgement, making SC-003 unmeasurable? [Clarity, Spec §SC-003, Gap]
- [x] CHK035 — Is the distinction between Notion's "callout" block and Obsidian's `> [!TYPE]` callout defined clearly enough to specify separate import requirements — does the spec address both HTML-origin callouts (Notion paste) and markdown-origin callouts (Obsidian paste) with explicit per-path requirements? [Clarity, Spec §FR-026, FR-029, SC-003, Gap]
- [x] CHK036 — Is the import requirement for Notion inline highlight defined — Notion supports coloured text and background-coloured text; does the spec require that Notion highlight colours on paste map to AFFiNE's `==highlight==` attribute, and is the colour mapping (Notion yellow → `var(--affine-highlight-yellow)`) specified? [Clarity, Spec §FR-005, SC-003, Gap]
- [x] CHK037 — Is the import requirement for Notion's "mention" blocks (page mentions, person mentions, date mentions) defined — SC-003 targets 90% of common Notion block types; are mentions explicitly excluded or implicitly included, and if excluded, is this stated? [Clarity, Spec §SC-003, Gap]

---

## Notion Block Types — Consistency

- [x] CHK038 — Are the Notion paste requirements (SC-003) consistent with the round-trip fidelity requirements (SC-008) — if Notion content pastes as AFFiNE blocks, and those blocks are then exported to markdown and re-imported, must the round-trip also preserve the originally pasted Notion content, or is SC-008 only for AFFiNE-originated content? [Consistency, Spec §SC-003, SC-008]
- [x] CHK039 — Is the Notion toggle block import requirement (FR-030/FR-031) consistent with the SC-003 "toggles" claim — FR-031 defines `<details>` paste producing a toggle block, which covers Notion's HTML export path; but does the spec explicitly confirm this is the mechanism SC-003 relies on, or is there a gap between the FR and the SC? [Consistency, Spec §FR-030, FR-031, SC-003]

---

## Acceptance Criteria Quality

- [x] CHK040 — Is SC-002 ("95% of common Obsidian constructs") measurable without a defined reference list of Obsidian constructs — can the acceptance criterion be evaluated objectively if the universe of "common constructs" is not enumerated in the spec or an appendix? [Measurability, Spec §SC-002]
- [x] CHK041 — Is SC-003 ("90% of common Notion block types") measurable without a defined reference list of Notion block types — Notion has documented block types (paragraph, heading1/2/3, bulleted list, numbered list, toggle, code, quote, callout, divider, table, to-do, column, embed, etc.); does the spec enumerate which are in scope? [Measurability, Spec §SC-003, Gap]
- [x] CHK042 — Is the distinction between "renders correctly" (SC-002, SC-003) and "retains all formatting" (SC-008) defined — does "renders correctly" on paste require the same CRDT fidelity as SC-008's round-trip, or is a visually equivalent but structurally different block acceptable? [Measurability, Spec §SC-002, SC-003, SC-008, Gap]
- [x] CHK043 — Are the acceptance scenarios in User Story 2 (Obsidian wikilinks, S2) measurable for the paste case — S2 scenario 3 says "all wikilinks are converted" on paste; is "all" defined as 100%, or is there a permitted failure rate analogous to SC-002's 95%? [Measurability, Spec §S2, SC-002]

---

## Scenario Coverage

- [x] CHK044 — Is there an import requirement defined for pasting Obsidian content that mixes constructs from multiple categories in a single paste — e.g. a vault page containing wikilinks, callouts, task lists, and tags all in the same document; does the spec define behaviour when the paste parser encounters all of these simultaneously? [Coverage, Spec §Edge Cases, Gap]
- [x] CHK045 — Is there a requirement defined for pasting Notion content that uses nested block structures — e.g. a toggle block containing a table containing a task list; does the spec address nested Notion block paste fidelity, or only flat/single-level blocks? [Coverage, Spec §SC-003, Gap]
- [x] CHK046 — Is there an import requirement defined for the case where Obsidian and Notion content is pasted into the same document — the edge case spec mentions "Pasting content from Notion's HTML export alongside Obsidian markdown... must not cause parser conflicts", but does the spec define a requirement (not just an aspiration) for how the parser determines which syntax applies? [Coverage, Spec §Edge Cases, Gap]
- [x] CHK047 — Is there an import requirement defined for Obsidian vault content that uses Obsidian's custom CSS snippets or theme-specific syntax — or is the scope of "Obsidian constructs" explicitly limited to Obsidian Flavored Markdown (OFM) syntax only, excluding visual-theme extensions? [Coverage, Spec §SC-002, Gap]
- [x] CHK048 — Is there an import requirement defined for partial Obsidian constructs in pasted content — e.g. a wikilink that is cut off (`[[Page Nam`), or an unclosed callout; does the spec define whether partial constructs are rendered as plain text or flagged as errors on paste? [Coverage, Edge Case, Gap]

---

## Edge Case Coverage

- [x] CHK049 — Is the import requirement defined for Obsidian wikilinks whose target title contains characters that are also markdown delimiters (`|`, `[`, `]`, `#`) — the edge case spec mentions this, but does FR-008 (or an adjacent FR) specify the expected import behaviour (escaping, truncation, or error)? [Edge Case, Spec §Edge Cases, FR-008, Gap]
- [x] CHK050 — Is the import requirement defined for Notion blocks that AFFiNE does not have a native equivalent for (e.g. Notion "database", "gallery", "board" views) — does the spec define a fallback import behaviour (plain text, error block, omitted) for unsupported Notion block types? [Edge Case, Spec §SC-003, Gap]
- [x] CHK051 — Is the import requirement defined for Obsidian comments that contain other Obsidian syntax (`%% [[wikilink]] %%`, `%% > [!NOTE] %%`) — does the spec require that the enclosed syntax is NOT parsed (comment wins), or is this an undefined interaction? [Edge Case, Spec §FR-036, Edge Cases, Gap]
- [x] CHK052 — Is the import requirement defined for Notion content copied from the Notion mobile app vs. the Notion desktop app — Notion's clipboard format may differ between clients; does the spec assume a single Notion clipboard format, or does it bound the requirement to a specific Notion export path (e.g. "copy as markdown")? [Edge Case, Spec §SC-003, Gap]

---

## Dependencies & Assumptions

- [x] CHK053 — Is the assumption that pasted Obsidian content arrives as plain markdown text (not proprietary binary format) explicitly documented — SC-002 and FR-008/FR-026 etc. rely on Obsidian using a pasteable markdown format; is this dependency stated? [Assumption, Spec §SC-002, Gap]
- [x] CHK054 — Is the assumption that pasted Notion content arrives as HTML (Notion copies as HTML to clipboard) explicitly documented — the Notion paste requirements (SC-003, FR-020, FR-031) appear to rely on an HTML-to-block conversion path; is this dependency stated, and is the specific Notion clipboard format (HTML, RTF, plain text) defined? [Assumption, Spec §SC-003, Gap]
- [x] CHK055 — Is the dependency on a separate HTML import adapter (for Notion HTML paste) documented as distinct from the markdown import adapter (for Obsidian markdown paste) — if these are two different code paths, is this architectural distinction acknowledged as an assumption in the spec? [Dependency, Spec §SC-003, FR-031, Gap]

---

## Notes

- All 55 items resolved 2026-03-07 by adding migration compatibility assumptions to spec.md Assumptions section and a clarifications session entry
- Key decisions recorded: paste path universality (all FRs apply to paste via import adapter — CHK001–CHK022); Obsidian = `text/plain` markdown, Notion = `text/html` HTML (CHK053/CHK054); separate HTML adapter for Notion paste (CHK055); SC-002 95% base = 20 constructs, SC-003 90% base = 11 block types (CHK015/CHK041); "renders correctly" = CRDT structural fidelity (CHK042); Notion callout → "note" fallback via HTML adapter (CHK026); Notion mentions excluded (CHK037); Obsidian embed → plain text (CHK012); partial constructs → plain text (CHK048); comment syntax takes precedence over nested markdown (CHK051)
- Gate: Review before Phase A (inline formatting) and Phase B (wikilinks) begin
