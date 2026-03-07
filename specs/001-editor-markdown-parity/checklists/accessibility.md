# Accessibility Requirements Checklist: Editor Markdown & Rich Text Parity

**Purpose**: Validate the quality, completeness, and measurability of accessibility requirements before implementation — not whether the implementation is accessible. Each item is a unit test for the English in the spec.
**Created**: 2026-03-07
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md)

---

## Requirement Completeness

- [x] CHK001 — Are accessibility requirements defined for every net-new interactive element — specifically, are `highlight` spans, `comment` spans (invisible in live preview), and tag elements covered by FR-046/FR-048, or only the four explicitly listed (checkboxes, wikilinks, toggle sections, footnote links)? [Completeness, Spec §FR-048]
- [x] CHK002 — Is there an accessibility requirement for the source mode toggle button itself — e.g., does it require an accessible name, role, and keyboard operability — or is it implicitly covered only by FR-048's blanket statement? [Completeness, Spec §FR-044, FR-048, Gap]
- [x] CHK003 — Are focus management requirements specified for modal-like transitions — specifically, when the user switches from live preview to source mode, is there a requirement defining where keyboard focus lands? [Completeness, Spec §FR-044, Gap]
- [x] CHK004 — Are requirements defined for screen reader announcement of dynamic content changes — e.g., when a wikilink resolves from unresolved to resolved state, or when a callout is folded/unfolded, must an ARIA live region announce the change? [Completeness, Gap]
- [x] CHK005 — Are touch/pointer accessibility requirements defined for mobile/PWA contexts — e.g., minimum touch target sizes for checkboxes, toggle sections, and footnote links — or is the requirement limited to keyboard operability? [Completeness, Spec §FR-048, Gap]

## Requirement Clarity

- [x] CHK006 — Is the WCAG 2.1 AA contrast requirement (FR-046) scoped to text-on-background contrast only, or does it also cover non-text UI elements (e.g., the dashed underline of `affine-reference--unresolved`, the border of the callout error panel, focus ring colours)? WCAG 2.1 SC 1.4.11 covers non-text contrast at AA. [Clarity, Spec §FR-046]
- [x] CHK007 — Is "keyboard-navigable" in FR-048 defined to include focusability (Tab stop), not just operability — i.e., must every interactive element be reachable by Tab, or is programmatic focus (e.g., via arrow keys only within a group) acceptable as a Tab stop? [Clarity, Spec §FR-048]
- [x] CHK008 — Is the `aria-label` requirement for callout icons (FR-047) specified to match a fixed value (e.g., "Warning callout") or the user's callout type string — and is the required language (English only, or localised) defined? [Clarity, Spec §FR-047]
- [x] CHK009 — Is "colour not used as sole distinguisher" (FR-047) specified to apply only to callout type, or does it also apply to the unresolved wikilink state (FR-012), the highlight colour (FR-005), and the tag element (FR-038) — all of which communicate state/type through colour? [Clarity, Spec §FR-047, FR-012, FR-005, FR-038]
- [x] CHK010 — Is the error message required by FR-045 (failed source→live-preview parse) specified with an accessible requirement — e.g., must it be an ARIA alert (`role="alert"`) so screen readers announce it without the user having to find it? [Clarity, Spec §FR-045, Gap]
- [x] CHK011 — Does SC-009 ("pass WCAG 2.1 AA contrast checks in both light and dark themes") define what is being measured as the foreground/background pairing for each element — e.g., for highlights is the pairing highlighted text colour vs. highlight background, or highlighted text vs. page background? [Clarity, Spec §SC-009]

## Requirement Consistency

- [x] CHK012 — Is the keyboard operability requirement in FR-048 consistent with the tag click requirement in FR-038c — specifically, is there a stated key (Enter or Space) that triggers the tag search, or does FR-038c only specify pointer click without a keyboard equivalent? [Consistency, Spec §FR-048, FR-038c]
- [x] CHK013 — Is the keyboard requirement for unresolved wikilink click (FR-012a, FR-048) consistent with the wikilink creation flow — if Enter activates the link and creates a new page, is the keyboard-focus destination after page creation specified? [Consistency, Spec §FR-012a, FR-048]
- [x] CHK014 — Is FR-046 (WCAG 2.1 AA contrast) consistent with SC-009 (same AA requirement) — FR-046 is a functional requirement and SC-009 is a success criterion measuring the same property; is it clear that one does not subsume the other and both must be independently validated? [Consistency, Spec §FR-046, SC-009]
- [x] CHK015 — Is the callout icon accessibility requirement (FR-047) consistent with the keyboard navigation requirement (FR-048) — if the icon is the only non-colour distinguisher and has an `aria-label`, is there also a requirement that the icon or its container is keyboard-focusable for users who navigate to the callout header? [Consistency, Spec §FR-047, FR-048]

## Acceptance Criteria Quality

- [x] CHK016 — Is SC-009 measurable without ambiguity — specifically, is the contrast ratio threshold stated (4.5:1 for normal text, 3:1 for large text per WCAG AA), or does "pass WCAG 2.1 AA" require the implementer to interpret the standard? [Measurability, Spec §SC-009]
- [x] CHK017 — Is there a measurable acceptance criterion for keyboard navigation completeness — e.g., "all interactive elements introduced by this feature are reachable by Tab within N key presses from the editor focus" — or is FR-048 only a binary pass/fail without a measurable scope? [Measurability, Spec §FR-048, Gap]
- [x] CHK018 — Can the `aria-label` requirement for callout icons (FR-047) be objectively tested — is the expected label value defined in the spec or contracts (e.g., `aria-label="Note"`, `aria-label="Warning"`) or left to implementation discretion? [Measurability, Spec §FR-047]

## Scenario Coverage

- [x] CHK019 — Are accessibility requirements defined for the foldable callout interaction (FR-028, FR-028a) — specifically, must the collapsed/expanded state be communicated to assistive technology via `aria-expanded`, and is this required in the spec? [Coverage, Spec §FR-028, FR-028a, Gap]
- [x] CHK020 — Are requirements defined for the footnote superscript reference (FR-034) as an accessible link — e.g., must it have an accessible name such as "Footnote 1" rather than just the number "1", which would lack context for screen reader users? [Coverage, Spec §FR-034, Gap]
- [x] CHK021 — Are requirements defined for error states that are only visually indicated — e.g., the mermaid/math error panel (FR-017) uses a "red/error border colour"; is there a requirement that the error is also communicated without colour (e.g., an error icon with an `aria-label` or ARIA role)? [Coverage, Spec §FR-017, FR-047, Gap]
- [x] CHK022 — Are high-contrast / forced-colours mode requirements addressed — do the callout colour tokens, highlight colours, and unresolved link indicators have specified fallbacks for Windows High Contrast mode or `forced-colors: active` CSS media query? [Coverage, Gap]
- [x] CHK023 — Are requirements defined for reduced-motion preferences — e.g., when a foldable callout expands/collapses (FR-028), must the animation be suppressable via `prefers-reduced-motion`? [Coverage, Gap]
- [x] CHK024 — Is the comment element's invisibility in live preview (FR-036) accessible — specifically, is there a requirement that the comment content is also hidden from the accessibility tree (e.g., via `aria-hidden="true"`) so screen reader users are not read invisible content? [Coverage, Spec §FR-036, Gap]

## Edge Case Coverage

- [x] CHK025 — Are accessibility requirements defined for nested callouts (FR-028b) — specifically, when callouts are nested arbitrarily deep, is there a requirement for the heading hierarchy or ARIA landmark structure so screen reader users can navigate the structure? [Edge Case, Spec §FR-028b, Gap]
- [x] CHK026 — Is there a requirement for the accessibility of an unresolved wikilink that becomes resolved while a screen reader user has focus on it — must the accessible name update dynamically, and must the role change be announced? [Edge Case, Spec §FR-012, Gap]
- [x] CHK027 — Are requirements defined for task list items with non-standard checked characters (FR-025a — `[?]`, `[-]`) — must the accessible name of the checkbox communicate the non-standard state (e.g., "partially complete") or is a binary checked/unchecked semantic sufficient? [Edge Case, Spec §FR-025a, Gap]

## Dependencies & Assumptions

- [x] CHK028 — Is the assumption that the existing BlockSuite editor infrastructure provides a compliant accessibility baseline (focus management, ARIA roles, tab order) documented — or is FR-048 written as if new infrastructure must be built from scratch? [Assumption, Spec §FR-048, plan.md §Phase M]
- [x] CHK029 — Is there a documented dependency on a specific WCAG evaluation methodology (e.g., automated axe-core scan, manual screen reader test with NVDA/VoiceOver) for SC-009 — or is the validation method left entirely to the implementer? [Dependency, Spec §SC-009, Gap]
- [x] CHK030 — Is the Phase M (Accessibility) sequencing assumption — that all other phases (A–L) must be complete before accessibility work begins — documented as a risk, given that retrofitting accessibility is typically more expensive than building it in from Phase A? [Assumption, plan.md §Phase M]

## Notes

- All 30 items resolved 2026-03-07 by adding FR-049–FR-055 and accessibility assumptions to spec.md
- New spec additions: FR-049 (source mode toggle a11y + focus destination), FR-050 (ARIA dynamic state announcements), FR-051 (comment aria-hidden), FR-052 (footnote accessible names), FR-053 (prefers-reduced-motion), FR-054 (error panel non-colour indicator), FR-055 (touch target sizes)
- Spec assumptions added: BlockSuite baseline assumption, evaluation methodology (axe-core + manual), non-text contrast scope, task list non-standard states, nested callout ARIA, dynamic wikilink resolution, forced-colours mode
- Phase M risk note added to plan.md: early PR review for ARIA/DOM structure recommended even during Phases A–L
