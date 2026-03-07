# Feature Specification: Editor Markdown & Rich Text Parity

**Feature Branch**: `001-editor-markdown-parity`
**Created**: 2026-03-07
**Status**: Draft

## Overview

The AFFiNE editor currently lacks support for many standard markdown and rich text formatting conventions that users migrating from Notion or Obsidian rely on daily. This feature brings the editor to full parity with Notion's writing and editing basics and GitHub Flavored Markdown (GFM), plus Obsidian-flavored markdown extensions, so that content created in those tools renders and behaves correctly in AFFiNE without manual reformatting.

Embeds (inline iframes from external services) are explicitly out of scope for this iteration.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Inline Text Formatting Works as Typed (Priority: P1)

A writer types `**bold**`, `*italic*`, `~~strikethrough~~`, `==highlight==`, and `` `inline code` `` in the editor. Each renders immediately as formatted text without requiring a separate toolbar action (live preview mode). An optional source mode displays and edits the raw markdown. Keyboard shortcuts (Ctrl/Cmd+B, I, etc.) also apply the same formatting.

**Why this priority**: This is the most fundamental authoring capability. Users expect markdown shortcuts to work as they type — their absence makes the editor feel broken for anyone coming from Notion, Obsidian, or any markdown-aware tool.

**Independent Test**: Open a blank document, type each inline formatting sequence, and verify each renders as styled text. Delivers a usable, visually correct editing experience with no other stories required.

**Acceptance Scenarios**:

1. **Given** a blank document, **When** the user types `**word**` and presses Space, **Then** "word" appears bold and the asterisks are consumed.
2. **Given** a blank document, **When** the user types `*word*`, **Then** "word" appears italic.
3. **Given** a blank document, **When** the user types `~~word~~`, **Then** "word" appears with strikethrough.
4. **Given** a blank document, **When** the user types `==word==`, **Then** "word" appears highlighted (background colour).
5. **Given** a blank document, **When** the user types `` `word` ``, **Then** "word" appears as inline code.
6. **Given** selected text, **When** the user presses Ctrl/Cmd+B, **Then** the text becomes bold (and toggles off on a second press).
7. **Given** a document with bold text, **When** pasted into a plain-text context, **Then** the exported markdown uses `**...**` notation.

---

### User Story 2 - Obsidian Wikilinks Auto-Convert to Navigable Links (Priority: P1)

A user pastes or types content that includes Obsidian wikilinks such as `[[Page Name]]`, `[[Page Name|Display Text]]`, or block references `[[Note^block-id]]`. The editor converts these to navigable internal links automatically, using the display text where provided.

**Why this priority**: Obsidian is a primary migration source. Wikilinks are Obsidian's core linking mechanism — failing to handle them means all cross-linked Obsidian content arrives broken.

**Independent Test**: Type or paste `[[My Note]]` into a document. Verify it renders as a link labelled "My Note". Independently valuable without any other story.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user types `[[Page Name]]`, **Then** it renders as a link with label "Page Name".
2. **Given** a document, **When** the user types `[[Page Name|Alias]]`, **Then** it renders as a link with label "Alias".
3. **Given** a document, **When** the user pastes Obsidian markdown containing wikilinks, **Then** all wikilinks are converted to navigable links on paste.
4. **Given** a wikilink to a non-existent page, **When** rendered, **Then** the link appears in an unresolved visual state (e.g. dimmed or dashed underline).
5. **Given** an unresolved wikilink, **When** the user clicks it, **Then** a new AFFiNE page with that title is created and the link resolves.
6. **Given** a block reference `[[Note#^block-id]]`, **When** rendered, **Then** it appears as a link; if the specific block cannot be located it falls back gracefully to a note-level link.

---

### User Story 3 - Code Blocks with Syntax Highlighting (Priority: P1)

A developer pastes a fenced code block (` ```python ... ``` `) into a document. The block renders with the correct language label and syntax-highlighted code. Supported languages include at minimum: JavaScript/TypeScript, Python, Go, Rust, Shell/Bash, JSON, YAML, HTML, CSS, SQL.

**Why this priority**: Code blocks are essential for technical documentation. Syntax highlighting is a baseline expectation in any developer-facing editor and a core GFM feature.

**Independent Test**: Paste a fenced code block with a language identifier. Verify syntax highlighting appears. Independently testable and delivers immediate value for technical writers.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user types ` ```python ` and Enter, **Then** a code block opens in Python mode with syntax highlighting.
2. **Given** a code block, **When** the user types valid Python code, **Then** keywords, strings, and comments are coloured distinctly.
3. **Given** a code block with an unrecognised language identifier, **When** rendered, **Then** the block displays as plain monospace text without error.
4. **Given** a code block, **When** the user changes the language selector, **Then** highlighting updates immediately.
5. **Given** a document exported as markdown, **When** inspected, **Then** code blocks include the original language identifier in the fence.

---

### User Story 4 - Mermaid Diagrams Render in Code Blocks (Priority: P2)

A user creates a ` ```mermaid ` fenced block and writes diagram syntax (flowchart, sequence diagram, etc.). The editor renders the diagram visually within the document rather than showing raw text.

**Why this priority**: Mermaid is the de-facto standard for text-based diagrams in markdown tools. It is expected by users from GitHub, Notion, and Obsidian. Blocked on Story 3 (code blocks) but independently deployable once that foundation exists.

**Independent Test**: Create a `mermaid` code block with a simple flowchart. Verify a rendered diagram appears. Independently valuable for documentation-heavy users.

**Acceptance Scenarios**:

1. **Given** a ` ```mermaid ` block with valid flowchart syntax, **When** rendered, **Then** a diagram is displayed visually.
2. **Given** a mermaid block with invalid syntax, **When** rendered, **Then** an error indicator is shown (not a blank or crashed block).
3. **Given** valid mermaid for sequence, class, gantt, pie, and state diagrams, **When** rendered, **Then** each type displays correctly.
4. **Given** a document with a mermaid diagram, **When** exported as markdown, **Then** the original mermaid source is preserved in the export.

---

### User Story 5 - Math Expressions (LaTeX) Render Correctly (Priority: P2)

A user writes inline math (`$E=mc^2$`) or display math (`$$\int_0^\infty$$`) using LaTeX notation. Both render as typeset mathematical expressions.

**Why this priority**: Required for academic and scientific users. A standard GFM/Obsidian feature. Independently deployable.

**Independent Test**: Type `$x^2 + y^2 = r^2$` inline and `$$\frac{a}{b}$$` as a block. Verify both render as typeset math.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user wraps text in `$...$`, **Then** it renders as inline typeset math.
2. **Given** a document, **When** the user wraps a block in `$$...$$`, **Then** it renders as a centred display math block.
3. **Given** invalid LaTeX, **When** rendered, **Then** the raw source is shown with an error indicator rather than crashing.
4. **Given** a document with math, **When** exported as markdown, **Then** the `$...$` and `$$...$$` delimiters are preserved.

---

### User Story 6 - Tables with Full GFM Support (Priority: P2)

A user types or pastes a GFM-style markdown table including column alignment syntax. The table renders as a visual grid. Users can also create and edit tables via the slash command menu.

**Why this priority**: Tables are a core content structure in both Notion and Obsidian. GFM tables are the universal markdown table standard.

**Independent Test**: Paste a GFM table with alignment markers. Verify it renders as a formatted table.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user pastes a valid GFM table, **Then** it renders as a formatted table with correct column alignment (left, right, centre).
2. **Given** a table, **When** the user adds a new row, **Then** the table updates with the new row preserving column structure.
3. **Given** a table, **When** exported as markdown, **Then** the output is valid GFM table syntax.
4. **Given** a malformed table (missing pipes or mismatched columns), **When** pasted, **Then** the editor renders it best-effort without crashing.

---

### User Story 7 - Callouts / Admonitions (Priority: P2)

A user creates an Obsidian-style callout using `> [!NOTE]` syntax, or a Notion-style callout block via the slash menu. The callout renders as a visually distinct block with an icon and colour corresponding to the callout type (note, tip, warning, danger, info, etc.).

**Why this priority**: Callouts are heavily used in Obsidian vaults and Notion pages for structured annotations. Critical for migration fidelity.

**Independent Test**: Type `> [!WARNING]` followed by content. Verify it renders as a styled warning callout block.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user types `> [!NOTE]` and content, **Then** a styled "Note" callout block renders with an appropriate icon.
2. **Given** callout types note, tip, warning, danger, info, success, question, failure, bug, example, quote, **When** each is used, **Then** each renders with a distinct colour and icon.
3. **Given** a callout, **When** the content inside is edited, **Then** the callout frame is preserved.
4. **Given** a foldable callout with `-` suffix (`> [!NOTE]-`), **When** rendered, **Then** the content is collapsed by default and expands on interaction.
5. **Given** a foldable callout with `+` suffix (`> [!NOTE]+`), **When** rendered, **Then** the content is expanded by default and can be collapsed.
6. **Given** nested callouts (a callout inside a callout), **When** rendered, **Then** each level renders correctly with its own styling.

---

### User Story 8 - Task Lists / Checkboxes (Priority: P2)

A user types `- [ ] item` or `- [x] item` to create an interactive task list. Checkboxes are clickable and toggle between checked/unchecked state, updating the underlying document.

**Why this priority**: Task lists are a core GFM and Obsidian feature used daily for project tracking. Expected by users from both platforms.

**Independent Test**: Type `- [ ] Buy milk` and verify an interactive checkbox appears. Check it and verify state persists.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user types `- [ ] Task`, **Then** an unchecked checkbox with the label "Task" appears.
2. **Given** an unchecked task, **When** the user clicks the checkbox, **Then** it becomes checked and the label gains a visual completion style.
3. **Given** `- [x] Done`, **When** rendered, **Then** the item appears pre-checked.
4. **Given** a task item with any character inside brackets (e.g. `- [?]`, `- [-]`), **When** rendered, **Then** it displays as a completed/marked state (Obsidian treats any non-space character as "done").
5. **Given** a task list, **When** exported as markdown, **Then** checked items use `[x]` and unchecked use `[ ]`.

---

### User Story 9 - Collapsed / Toggle Sections (Priority: P3)

A user creates a collapsible section using the Notion toggle list block or GFM `<details><summary>` syntax. Content inside the toggle is hidden by default and revealed on interaction.

**Why this priority**: Toggle/collapsible blocks reduce visual clutter in long documents. A standard Notion feature.

**Independent Test**: Create a toggle block via the slash menu. Verify it collapses and expands on click.

**Acceptance Scenarios**:

1. **Given** a toggle block, **When** rendered, **Then** only the summary/title is visible by default.
2. **Given** a collapsed toggle, **When** the user clicks it, **Then** the content expands and is fully readable.
3. **Given** a `<details><summary>` block in pasted HTML/markdown, **When** rendered, **Then** it behaves as a collapsible section.

---

### User Story 10 - Footnotes (Priority: P3)

A user adds a footnote reference `[^1]` in text and a footnote definition `[^1]: Definition text` at the bottom of the document. The reference renders as a superscript number that links to the footnote definition.

**Why this priority**: Standard in academic and long-form writing. Supported by Obsidian.

**Independent Test**: Add `[^1]` inline and `[^1]: Source text` at the bottom. Verify the reference appears as a superscript and clicking it navigates to the footnote.

**Acceptance Scenarios**:

1. **Given** inline `[^1]` and a matching `[^1]: Text` definition, **When** rendered, **Then** the reference appears as a superscript number.
2. **Given** a footnote reference, **When** the user clicks it, **Then** focus moves to the footnote definition.
3. **Given** a footnote definition, **When** the user clicks the back-link, **Then** focus returns to the inline reference.
4. **Given** an inline footnote `^[Definition text]`, **When** rendered, **Then** it appears as a superscript number with the definition accessible on hover or in a footnotes section.

---

### User Story 11 - Comments Hidden from Rendered View (Priority: P3)

A user adds an Obsidian-style comment (`%% comment text %%`) to a document. The comment is visible in source/edit mode but does not appear in the rendered/preview output.

**Why this priority**: Author-only notes are a standard authoring pattern in Obsidian vaults.

**Independent Test**: Add `%% private note %%` in a document. Verify it is not visible in preview/read mode.

**Acceptance Scenarios**:

1. **Given** text containing `%% hidden %%`, **When** rendered, **Then** "hidden" does not appear in the document output.
2. **Given** a comment in edit mode, **When** the user switches to read mode, **Then** the comment content is invisible.

---

### User Story 12 - Autolinked URLs and References (Priority: P3)

Plain URLs typed or pasted into a document are automatically converted to clickable hyperlinks without requiring markdown link syntax. GitHub-style autolinks (e.g., issue numbers, commit SHAs) are supported where applicable.

**Why this priority**: Standard user expectation. All major editors and GFM support this.

**Independent Test**: Paste `https://example.com` as plain text. Verify it becomes a clickable link.

**Acceptance Scenarios**:

1. **Given** a plain URL typed or pasted, **When** the user presses Space or Enter, **Then** the URL is converted to a clickable hyperlink.
2. **Given** an email address, **When** typed, **Then** it is converted to a `mailto:` link.
3. **Given** a clickable link, **When** the user hovers, **Then** the destination URL is shown in a tooltip.

---

### User Story 13 - Obsidian Tags (Priority: P3)

A user types `#tag-name` in a document (not at the start of a line, which would create a heading). The tag is recognised and rendered as a styled, clickable tag element that can be used to organise content.

**Why this priority**: Tags are a primary organisation mechanism in Obsidian. Users expect them to be preserved and functional.

**Independent Test**: Type `This is #important` and verify `#important` renders as a tag element distinct from plain text.

**Acceptance Scenarios**:

1. **Given** `#tag-name` appearing inline (not at line start), **When** rendered, **Then** it displays as a styled tag element.
2. **Given** a tag, **When** clicked, **Then** the workspace search opens pre-filtered to that tag.
3. **Given** `# Heading` at the start of a line, **When** rendered, **Then** it renders as an H1 heading, not a tag.

---

### Edge Cases

- A document containing mixed Obsidian and standard markdown syntax must render each element correctly without one format interfering with the other.
- A wikilink whose target note has a title containing special markdown characters (e.g., `[[Note with **bold** title]]`) must not corrupt the surrounding document.
- A fenced code block containing triple backticks in its content must use a longer fence (four backticks) and not prematurely close the block.
- A math expression containing `$` in a non-math context (e.g., a price like "costs $5") must not be incorrectly parsed as a math delimiter.
- A table with very wide content must not overflow its container and must provide horizontal scrolling.
- Nested callouts (callout inside a callout) must render correctly at each nesting level, consistent with Obsidian's native behaviour.
- A footnote reference with no corresponding definition must render gracefully (e.g., as plain text or with an unresolved indicator).
- Comments containing other markdown syntax (e.g., `%% **bold** %%`) must not bleed formatted content into the document.
- Pasting content from Notion's HTML export alongside Obsidian markdown in the same document must not cause parser conflicts.

---

## Requirements _(mandatory)_

### Functional Requirements

#### Inline Formatting

- **FR-001**: The editor MUST render `**text**` and `__text__` as bold.
- **FR-002**: The editor MUST render `*text*` and `_text_` as italic.
- **FR-003**: The editor MUST render `***text***` as bold italic.
- **FR-004**: The editor MUST render `~~text~~` as strikethrough.
- **FR-005**: The editor MUST render `==text==` as highlighted text (background colour). The shortcut fires when Space is pressed immediately after the closing `==` (consistent with all other `InlineMarkdownExtension` rules). The default highlight colour is `var(--affine-highlight-yellow)`. The pattern does not support nested or adjacent `==` sequences (e.g. `==a==b==` is treated as `==a==` followed by literal `b==`); this edge case is explicitly out of scope.
- **FR-006**: The editor MUST render `` `text` `` as inline code.
- **FR-007**: The editor MUST support keyboard shortcuts (Ctrl/Cmd+B, I, U, etc.) for applying inline formatting to selected text.

#### Links

- **FR-008**: The editor MUST auto-convert `[[Page Name]]` wikilink syntax to navigable internal links. Conversion fires when `]]` is typed (not character-by-character). Title resolution is case-insensitive and uses a first-match strategy; if multiple pages share the same case-folded title the first created page is matched and no error is raised.
- **FR-008a**: The editor MUST support `[[Page Name#Heading]]` to link to a specific heading within a note.
- **FR-008b**: The editor MUST support `[[Page Name#^block-id]]` to link to a specific block within a note.
- **FR-009**: The editor MUST auto-convert `[[Page Name|Alias]]` wikilink syntax to a link with the alias as display text.
- **FR-010**: The editor MUST auto-convert plain URLs to clickable hyperlinks when the user presses Space or Enter after a valid URL (consistent with the wikilink trigger on `]]` and the highlight trigger on Space after `==`). Both Space and Enter trigger conversion.
- **FR-011**: The editor MUST render standard markdown links `[text](url)` as clickable hyperlinks.
- **FR-012**: The editor MUST render wikilinks that cannot be resolved to an existing workspace page in a visually distinct unresolved state, indicated by the CSS class `affine-reference--unresolved` (rendered as a dashed underline in both light and dark themes).
- **FR-012a**: Clicking an unresolved wikilink MUST create a new AFFiNE workspace page with the wikilink title and navigate to it, converting the link to resolved state. If a page with that title is found to exist at click time (race condition: another user created it between render and click), the click MUST navigate to the existing page rather than creating a duplicate.

#### Code Blocks

- **FR-013**: The editor MUST support fenced code blocks using triple backticks with an optional language identifier.
- **FR-014**: The editor MUST apply syntax highlighting for a minimum set of languages: JavaScript, TypeScript, Python, Go, Rust, Bash, JSON, YAML, HTML, CSS, SQL, Markdown.
- **FR-015**: The editor MUST render ` ```mermaid ` blocks as visual diagrams supporting flowchart, sequence, class, state, gantt, and pie chart types.
- **FR-016**: The editor MUST render ` ```math ` fenced blocks as typeset mathematical expressions using LaTeX notation. This is a separate entry point from `$$...$$` (FR-019) but produces the same rendered output — both render as centred display math. The two forms are interchangeable from the user's perspective; the implementation may normalise them to a single internal representation.
- **FR-017**: The editor MUST display an error indicator for invalid mermaid or math syntax. For mermaid, the error indicator MUST show a user-readable error message (the text of the parse error from the Mermaid library) inside a styled error panel with a red/error border colour — a blank view or uncaught crash is not acceptable. For math, the raw LaTeX source MUST be shown alongside the KaTeX error message.

#### Math

- **FR-018**: The editor MUST render `$...$` as inline typeset math.
- **FR-019**: The editor MUST render `$$...$$` as a centred display math block.

#### Tables

- **FR-020**: The editor MUST render GFM pipe-table syntax as a formatted, editable table.
- **FR-021**: The editor MUST honour column alignment specified by the separator row (`:---`, `:---:`, `---:`).
- **FR-022**: The editor MUST allow rows and columns to be added and removed from rendered tables. This requirement applies to live preview mode only; in source mode the user edits raw markdown text directly.

#### Task Lists

- **FR-023**: The editor MUST render `- [ ] item` as an unchecked interactive checkbox.
- **FR-024**: The editor MUST render `- [x] item` as a checked interactive checkbox.
- **FR-025**: The editor MUST toggle checkbox state when the user clicks a task list checkbox, and persist the change.
- **FR-025a**: The editor MUST treat any non-space character inside `[ ]` (e.g. `[x]`, `[?]`, `[-]`) as a marked/completed state. On markdown export, any marked task item with a non-standard character MUST be serialised as `[x]` to produce valid GFM (only `[x]` is universally understood as checked in GFM processors).

#### Callouts

- **FR-026**: The editor MUST render Obsidian callout syntax `> [!TYPE]` as a styled callout block with a type-specific icon and colour.
- **FR-027**: The editor MUST support at minimum these callout types and their canonical aliases: note (alias: note), info (aliases: info), tip (aliases: tip, hint, important), success (aliases: success, check, done), question (aliases: question, help, faq), warning (aliases: warning, caution, attention), failure (aliases: failure, fail, missing), danger (aliases: danger, error), bug (alias: bug), example (alias: example), quote (aliases: quote, cite). An unrecognised type MUST fall back to the "note" config.
- **FR-028**: Foldable callouts with `-` suffix (`> [!TYPE]-`) MUST render collapsed by default and expand on user interaction.
- **FR-028a**: Foldable callouts with `+` suffix (`> [!TYPE]+`) MUST render expanded by default and be collapsible on interaction. The `+` suffix means "expanded and collapsible" — the callout is not permanently pinned open.
- **FR-028b**: The editor MUST support nested callouts (callout blocks containing other callout blocks). There is no maximum nesting depth; any level of nesting is supported, consistent with Obsidian's native behaviour.
- **FR-029**: The editor MUST support creating Notion-style callout blocks via the slash command menu. Slash-command creation MUST pre-select the "note" callout type as the default; the user can change the type after creation. This is distinct from the Obsidian `> [!TYPE]` paste/type entry which sets the type from the syntax.

#### Collapsed Sections

- **FR-030**: The editor MUST support toggle/collapsible list blocks creatable via the slash command menu.
- **FR-031**: The editor MUST render `<details><summary>` HTML in pasted content as a collapsible section. A `<details>` block MUST be stored as an AFFiNE toggle block in the CRDT (not as raw HTML), with the `<summary>` content becoming the toggle's title text and the inner content becoming the toggle's body blocks.

#### Headings

- **FR-032**: The editor MUST render `#` through `######` ATX-style headings as H1–H6.
- **FR-033**: The editor MUST ensure `#tag` inline (not at line start) is not interpreted as a heading.

#### Footnotes

- **FR-034**: The editor MUST render `[^label]` inline references as superscript numbers linked to their footnote definitions.
- **FR-034a**: The editor MUST support inline footnotes using the `^[Definition text]` syntax. On export, an inline footnote MUST be serialised as a reference-style footnote (e.g. `[^1]` at the reference point and `[^1]: Definition text` at the bottom of the document) for maximum compatibility with GFM processors that do not support the inline form.
- **FR-035**: Clicking a footnote reference MUST navigate to the footnote definition; clicking the back-link MUST return to the reference.

#### Comments

- **FR-036**: The editor MUST hide `%% ... %%` comment blocks from the rendered/read view. Both single-line inline form (`%%text%%`) and multi-line block form (`%%\ntext\n%%`) MUST be supported; both are hidden in live preview and both apply the `comment: true` attribute to the enclosed text.
- **FR-037**: Comments MUST be visible and editable in source mode. In source mode the `%%` delimiters MUST be rendered visibly around the comment text (styled as grey/muted text) so the user can identify and edit the comment boundaries.

#### Editing Modes

- **FR-043**: The editor MUST operate in live preview mode by default, rendering all formatting inline as the user types.
- **FR-044**: The editor MUST provide an optional source mode that displays and allows editing of raw markdown syntax. The source mode toggle MUST be accessible from the editor toolbar (a button or menu item within the document editing surface, not buried in application settings). A keyboard shortcut is recommended but optional for this iteration.
- **FR-045**: Switching between live preview and source mode MUST preserve document content with no data loss. If the source mode content cannot be parsed when the user attempts to return to live preview, the editor MUST display an inline error message (within the source editor surface) and MUST NOT exit source mode — the user must correct the syntax before transitioning. This prevents accidental data loss from partial parses.

#### Tags

- **FR-038**: The editor MUST recognise `#tag-name` (letters, numbers, hyphens, underscores; must contain at least one non-numeric character; not at line start with a space after `#`) as an Obsidian-style tag and render it as a distinct styled element. A `#` at column 0 of any block followed by a space is a heading, not a tag; a `#` at column 0 followed immediately by a non-space character (e.g. `#tag` at line start) IS a tag candidate.
- **FR-038a**: The editor MUST support nested tags using forward slash notation (`#parent/child`).
- **FR-038b**: Tags MUST be case-insensitive for matching purposes (`#Tag` and `#tag` are the same tag). Display MUST preserve the original casing as typed by the user (e.g. `#Tag` renders with capital T).
- **FR-038c**: Clicking a tag MUST open the workspace search interface pre-filtered to that tag using the search query format `tag:<canonical-lowercase-name>` (e.g. clicking `#Inbox/Reading` submits `tag:inbox/reading`).

#### Block Quotes

- **FR-039**: The editor MUST render `> text` as a styled block quote.

#### Horizontal Rules

- **FR-040**: The editor MUST render `---`, `***`, or `___` on their own line as a horizontal divider.

#### Lists

- **FR-041**: The editor MUST render unordered lists (`-`, `*`, `+`) and ordered lists (`1.`, `2.`, etc.) with correct nesting.

#### Accessibility

- **FR-046**: All new formatting elements (callout backgrounds, highlight colours, tag styling, unresolved link indicators) MUST meet WCAG 2.1 AA contrast requirements. This includes: (a) text contrast — 4.5:1 minimum for normal-weight text under 18pt, 3:1 for bold or ≥18pt text (WCAG SC 1.4.3); and (b) non-text contrast — 3:1 minimum for UI component boundaries and graphical objects that convey information, such as the dashed underline of unresolved wikilinks, focus ring outlines, and the error border on mermaid/math error panels (WCAG SC 1.4.11). The contrast pairing for highlighted text is the foreground text colour against the highlight background colour (not against the page background). This requirement is evaluated independently for both light and dark themes.
- **FR-047**: Callout type MUST NOT be communicated by colour alone — each callout type MUST display a distinct icon with an `aria-label` equal to the callout type's human-readable label (e.g. `aria-label="Warning"`, `aria-label="Note"`). The label MUST use the application's active locale string; English is the baseline. The icon alone is sufficient as the non-colour distinguisher; a visible text label alongside the icon is not required. The "colour not sole distinguisher" requirement also applies to: (i) unresolved wikilinks — the dashed underline MUST be present in addition to any colour change; (ii) tag elements — a distinct background/border shape MUST differentiate tags from plain text, not colour alone.
- **FR-048**: All interactive elements introduced by this feature MUST be keyboard-navigable and operable without a pointer device. Covered elements: task list checkboxes, wikilinks (resolved and unresolved), toggle/collapsible sections, footnote reference links and back-links, tag elements, and the source mode toggle button. Required key behaviours: Tab/Shift+Tab to move focus to each interactive element; Enter or Space to activate a focused element; Arrow keys to navigate within a group (e.g. between task list items in the same list). Tag elements and wikilinks MUST have Enter and Space trigger the same action as pointer click.
- **FR-049**: The source mode toggle button MUST have an accessible name (e.g. `aria-label="Source mode"` / `"Live preview"`) and a visible focus indicator. When the user activates the toggle, keyboard focus MUST move to the first editable position in the newly active editor surface (source editor textarea or live preview root).
- **FR-050**: Dynamic state changes MUST be announced to assistive technology: (a) foldable callout expand/collapse MUST be communicated via `aria-expanded` on the toggle control; (b) wikilink resolution from unresolved to resolved MUST update the element's accessible name; (c) the failed-parse error message (FR-045) MUST be rendered with `role="alert"` or equivalent ARIA live region so screen readers announce it without requiring the user to navigate to it.
- **FR-051**: Comment content (`%% ... %%`) hidden in live preview (FR-036) MUST also be removed from the accessibility tree — implemented via `aria-hidden="true"` or equivalent — so screen reader users are not read invisible content.
- **FR-052**: Footnote reference superscripts (FR-034) MUST have an accessible name that provides context — e.g. `aria-label="Footnote 1"` — rather than exposing only the numeral "1", which lacks meaning for screen reader users navigating out of context. The back-link from definition to reference MUST similarly be labelled (e.g. `aria-label="Back to footnote 1 reference"`).
- **FR-053**: Foldable callout animations (expand/collapse, FR-028/FR-028a) MUST respect the user's `prefers-reduced-motion: reduce` media query — when set, transitions MUST be instant (duration: 0) rather than animated.
- **FR-054**: The mermaid/math error panel (FR-017) MUST communicate the error state without relying solely on the red/error border colour — the panel MUST include an error icon or text label (e.g. "Error") that is visually present and has an `aria-label` or accessible text independent of colour.
- **FR-055**: All new interactive elements MUST use sufficient touch target sizes on pointer-enabled devices: minimum 44×44 CSS pixels for checkboxes, the source mode toggle, callout fold/unfold controls, and footnote links (WCAG 2.5.5 AAA is the aspiration; 24×24 CSS pixels is the minimum acceptable floor per WCAG 2.2 SC 2.5.8 AA).

#### Export Fidelity

- **FR-042**: When exporting a document to markdown, all formatting applied in the editor MUST be represented correctly in the output using standard GFM or Obsidian-flavored markdown syntax. Serialisation rules:
  - `highlight` attribute → `==text==`
  - `comment` attribute → `%%text%%` (single-line) or `%%\ntext\n%%` (multi-line block form — multi-line comments MUST use the block form to preserve line structure)
  - Wikilink (resolved or unresolved) → `[[Page Name]]` or `[[Page Name|Alias]]`; wikilink alias MUST be preserved on export
  - Tag inline → plain `#tag-name` text using canonical lowercase form (tags do NOT re-create as styled tag elements on re-import; they are treated as plain text by GFM processors, which is the intended behaviour)
  - Callout → `> [!TYPE]\n> content`; foldable `-` → `> [!TYPE]-\n> content`; foldable `+` → `> [!TYPE]+\n> content`; the collapsed/expanded visual state (FR-028/FR-028a) is NOT required to survive round-trip — only the foldability capability (the `+`/`-` suffix) must be preserved
  - Nested callouts → standard Obsidian nested blockquote form: `> [!TYPE]\n> > [!TYPE2]\n> > content`
  - Toggle/collapsible section (stored as toggle block, FR-031) → `<details><summary>Title</summary>\nBody content\n</details>`; re-importing this HTML MUST reconstruct a toggle block
  - Block quote → `> text`; heading → `# text` (ATX form); horizontal rule → `---`; list → standard GFM unordered/ordered form
  - Highlighted text with mixed inline formatting (e.g., bold inside highlight) → `==**text**==` (highlight delimiters are outermost); this is the canonical form
  - The re-import direction: SC-008 applies to the paste-from-clipboard import path (i.e., exporting to clipboard and pasting back into AFFiNE). File-import is also in scope if an equivalent import command exists. Both paths must satisfy SC-008.
  - The CRDT representation is the canonical source of truth; markdown export is a serialisation. If a re-import cycle produces a document that differs from the original CRDT state only in ways listed as tolerated normalisation (SC-008), the round-trip is considered passing.
  - Block-nesting combinations inside code fences: content inside a code-fenced block is treated as raw text. AFFiNE-specific syntax (wikilinks, callouts, etc.) inside a code fence MUST NOT be interpreted or transformed on export or import — the raw text is preserved byte-for-byte. Round-trip fidelity for nested constructs inside code fences requires only raw text preservation, not semantic reconstruction of the nested syntax.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All 13 user story acceptance scenarios pass without manual workarounds in a fresh document.
- **SC-002**: Content copied from an Obsidian vault (including wikilinks, callouts, task lists, and inline formatting) pastes into AFFiNE and renders correctly for at least 95% of common Obsidian constructs.
- **SC-003**: Content copied from a Notion page (including headings, toggles, callouts, tables, and task lists) pastes into AFFiNE and renders correctly for at least 90% of common Notion block types (excluding embeds).
- **SC-004**: Syntax highlighting is visually present for code blocks in at least 12 common languages with no user configuration required.
- **SC-005**: Mermaid diagrams render within the document for all six supported diagram types without requiring the user to leave the editor.
- **SC-006**: Inline and display math expressions render as typeset output (not raw LaTeX) for correctly formed expressions.
- **SC-007**: Wikilinks are auto-converted on input with zero additional user steps required.
- **SC-008**: Round-trip fidelity: a document written in AFFiNE, exported to markdown, and re-imported retains all formatting with no visible degradation for all 13 user story formatting types — including both the 6 net-new types (highlight, comment, wikilinks, callout types, tags, source mode) and the 7 existing "verify + wire" types (code blocks with syntax highlighting, mermaid diagrams, math, tables, task lists, footnotes, autolinks). The target serialisation format for export is standard GFM or Obsidian-flavored markdown (not a proprietary AFFiNE dialect), using the syntax enumerated in FR-042. Tolerated normalisation: trailing newlines added or removed at the end of the document, and a single blank line between block-level elements normalised to zero or one blank line. Intolerant of: any loss or mutation of inline formatting attributes, block types, or link targets.
- **SC-009**: All new colour-bearing elements (callouts, highlights, tags, unresolved links) pass WCAG 2.1 AA contrast checks in both light and dark themes.

---

## Clarifications

### Session 2026-03-07

- Q: Which input mode does this feature target? → A: Both — live preview by default, with an optional source mode showing raw markdown.
- Q: What do wikilinks resolve against? → A: AFFiNE workspace pages by title; clicking an unresolved link creates a new page.
- Q: How should concurrent edit conflicts on markdown-rendered elements be handled? → A: Last-write-wins via the existing CRDT model — same as all other AFFiNE blocks.
- Q: What is the minimum accessibility target for new formatting elements? → A: WCAG 2.1 AA — minimum contrast ratios; colour not used as sole distinguisher.
- Q: What happens when a user clicks an Obsidian-style #tag in this iteration? → A: Opens workspace search pre-filtered to that tag using existing search infrastructure.

### Session 2026-03-07 (migration compatibility gap resolution)

- CHK001–CHK011,CHK013: Paste path universal coverage assumption added — all FRs apply equally to pasted content via the import adapter; no per-construct paste trigger is defined for the paste path.
- CHK012: Obsidian embed syntax (`![[...]]`) rendered as plain text on paste — documented in Assumptions.
- CHK014: "Renders correctly" = same CRDT block type and inline attribute structure as live-typed equivalent — defined in Assumptions.
- CHK015: SC-002 95% base = 20 Obsidian construct categories — enumerated in Assumptions.
- CHK016: Alias wikilink paste: alias preserved as display text (same outcome as typing `[[Page Name|Alias]]`).
- CHK017: Unrecognised callout type fallback to "note" applies on paste path (same rule as typed path, per paste universality assumption).
- CHK018: Nested block content inside pasted callouts IS parsed recursively — covered by paste path universality and nested Notion block paste assumptions.
- CHK019: Multi-line `%%\ntext\n%%` comment recognised on paste path — covered by paste path universality.
- CHK020–CHK022: Paste trigger consistency — paste uses import adapter (no per-construct trigger); heading/tag disambiguation rule applies uniformly to pasted content; wikilink paste trigger = paste event, not `]]` typed.
- CHK023: Notion heading HTML (`<h1>`–`<h6>`) → heading blocks — defined in HTML import adapter assumption.
- CHK024: Notion bold/italic HTML (`<strong>`, `<em>`) → bold/italic attributes — defined in HTML import adapter assumption.
- CHK025: Notion toggle → `<details>` HTML export → FR-031 path → toggle block — confirmed in HTML adapter assumption.
- CHK026: Notion callout div → "note" callout block via HTML adapter — defined in Notion callout HTML import assumption.
- CHK027: Notion `<table>` → table block via HTML adapter — defined in HTML import adapter assumption.
- CHK028: Notion `<input type="checkbox">` → task list item via HTML adapter — defined in HTML import adapter assumption.
- CHK029: Notion `<pre><code>` → code block (language from class) via HTML adapter — defined in HTML import adapter assumption.
- CHK030: Notion `<blockquote>` → block quote via HTML adapter — defined in HTML import adapter assumption.
- CHK031: Notion `<hr>` → horizontal rule via HTML adapter — defined in HTML import adapter assumption.
- CHK032: Notion `<ol><li>` → numbered list via HTML adapter — defined in HTML import adapter assumption.
- CHK033: Notion `<code>` inline → inline code attribute via HTML adapter — defined in HTML import adapter assumption.
- CHK034: SC-003 90% base = 11 Notion block types — enumerated in Assumptions.
- CHK035: Obsidian callout = markdown `> [!TYPE]` path; Notion callout = HTML div path — distinct import paths, both produce AFFiNE callout blocks.
- CHK036: Notion highlight → `var(--affine-highlight-yellow)` (colour-exact fidelity not required) — defined in Notion highlight colour mapping assumption.
- CHK037: Notion mention blocks explicitly excluded — documented in Assumptions.
- CHK038: SC-008 applies to all AFFiNE content including Notion-paste-originated blocks — documented in Assumptions.
- CHK039: SC-003 "toggles" relies on FR-031 `<details>` path via HTML adapter — confirmed in HTML adapter assumption.
- CHK040: SC-002 95% base enumerated — documented in Assumptions.
- CHK041: SC-003 90% base enumerated — documented in Assumptions.
- CHK042: "Renders correctly" = structural CRDT fidelity (not visual-only) — documented in Assumptions.
- CHK043: S2 "all wikilinks" = 100% of syntactically valid instances — documented in Assumptions.
- CHK044: Mixed Obsidian construct paste (wikilinks + callouts + tags + task lists in one paste) — covered by paste path universality; adapter processes all simultaneously.
- CHK045: Nested Notion block paste fidelity required for all 11 SC-003 types — documented in Assumptions.
- CHK046: Mixed Obsidian+Notion paste conflict: HTML clipboard takes precedence — documented in Assumptions.
- CHK047: Obsidian constructs scope = OFM syntax only; custom CSS/theme extensions out of scope — documented in Assumptions.
- CHK048: Partial/malformed Obsidian constructs → plain text (no error block) — documented in Assumptions.
- CHK049: Wikilink delimiter-conflict (`|`, `[`, `]` in title): last `|` = alias separator; no content loss — documented in Assumptions.
- CHK050: Notion unsupported blocks (database, gallery, etc.) silently dropped — documented in Assumptions.
- CHK051: Comment syntax takes precedence — `%% ... %%` content NOT parsed for markdown syntax — documented in Assumptions.
- CHK052: Notion clipboard = `text/html` MIME type regardless of Notion client (desktop/mobile); spec bounds requirement to this format.
- CHK053: Obsidian clipboard = plain markdown text (`text/plain`) — documented in Assumptions.
- CHK054: Notion clipboard = HTML — documented in Assumptions.
- CHK055: HTML import adapter distinct from markdown import adapter — documented in Assumptions.

### Session 2026-03-07 (round-trip fidelity gap resolution)

- CHK001: SC-008 enumerates all 13 types explicitly — 6 net-new + 7 "verify + wire" types listed by name.
- CHK002: SC-008 applies regardless of authoring mode; source mode content is subject to the same guarantee. Live-preview→source→source is covered separately by contracts §6.
- CHK003: FR-034a covers inline footnote export; FR-042 paste-path re-import resolves `[^N]:` back to a functional footnote.
- CHK004: FR-042 explicitly serialises block quotes, headings, and horizontal rules.
- CHK005: FR-042 covers nested callouts (Obsidian nested blockquote form).
- CHK006: Re-import = paste-from-clipboard (primary) and file-import (in scope if command exists) — both defined in FR-042.
- CHK007: SC-008 tolerance list (trailing newlines, blank-line count) is exhaustive; all other attributes are intolerant.
- CHK008: Re-imported `[[Page Name]]` undergoes same wikilink resolution as freshly typed — resolved/unresolved state re-determined at import time (not preserved as a static flag).
- CHK009: Tags remain plain text on re-import — intentional, documented in FR-042.
- CHK010: Folded/expanded state NOT required to survive round-trip; only `+`/`-` suffix capability preserved — documented in FR-042.
- CHK011: Multi-line comment exports as `%%\ntext\n%%` — defined in FR-042.
- CHK012: `==**text**==` is canonical form for highlight+bold — defined in FR-042.
- CHK013: SC-008 blank-line normalisation tolerance is consistent with FR-042 serialisers.
- CHK014: SC-008 and contracts §6 impose distinct but complementary obligations — documented in Assumptions.
- CHK015: Wikilink alias MUST be preserved — FR-042 explicit.
- CHK016: `[?]`→`[x]` normalisation is tolerated per SC-008 (not in intolerant list).
- CHK017: Per-type measurability defined in Assumptions (round-trip per-type measurability).
- CHK018: Mermaid source must be syntactically identical — defined in Assumptions.
- CHK019: Math export may normalise to `$$...$$` canonical form — defined in Assumptions.
- CHK020: 500ms is a performance aspiration in plan.md, not a correctness requirement — documented in Assumptions.
- CHK021: SC-008 = whole-document only; partial-document is out of scope — documented in Assumptions.
- CHK022: Mixed highlight+comment on same span: both attributes serialised independently — documented in Assumptions.
- CHK023: Block-nesting combinations (wikilink inside callout inside code fence in source mode): code-fenced content is raw text in source mode; no AFFiNE-specific syntax is interpreted inside a code fence. Round-trip for this combination is "raw text preserved" — no special nesting fidelity required.
- CHK024: FR-042 defines toggle → `<details>` export and re-import reconstructs toggle block.
- CHK025: FR-042 explicitly lists headings → ATX form.
- CHK026: SC-008 is AFFiNE→AFFiNE; external tools are best-effort — documented in Assumptions.
- CHK027: Empty/degenerate blocks MUST NOT be omitted — documented in Assumptions.
- CHK028: Correctness is unconditional regardless of document size — documented in Assumptions.
- CHK029: Delimiter-conflict characters: implementation must not lose content — documented in Assumptions.
- CHK030: CRDT is canonical source of truth — defined in FR-042 and Assumptions.
- CHK031: Import adapter dependency is an explicit assumption — documented in Assumptions.

### Session 2026-03-07 (gap resolution)

- CHK001/CHK005: `==highlight==` fires on Space (consistent with all other InlineMarkdownExtension rules); nested/adjacent `==` sequences are out of scope.
- CHK002: Default highlight colour is `var(--affine-highlight-yellow)`.
- CHK003: In source mode, comment `%%` delimiters are rendered visibly in grey/muted text around the comment content.
- CHK007: Wikilink title resolution is case-insensitive, first-match; duplicate titles are not an error.
- CHK009/CHK012: Unresolved wikilink uses CSS class `affine-reference--unresolved` (dashed underline). 12 required languages enumerated in FR-014.
- CHK010: Clicking an unresolved wikilink when the page has since been created by another user navigates to the existing page (no duplicate).
- CHK016: Malformed table best-effort = all parseable columns/rows rendered; at minimum the first complete row is visible; no crash.
- CHK019: `+` suffix = expanded by default AND collapsible (not permanently open).
- CHK020: Nested callouts have no maximum depth.
- CHK021: Existing callout blocks default to `calloutType=null`, `foldable=false`, `folded=false`; no migration required.
- CHK024: Source mode toggle is in the editor toolbar (accessible without opening application settings).
- CHK025: Failed source→live-preview parse shows inline error in source editor surface and blocks transition (FR-045).
- CHK026: `%%` delimiters visible in source mode confirms comment + source mode consistency.
- CHK027: SC-008 tolerates trailing newlines and blank-line count normalisation only; formatting attributes/block types/links must be exact.
- CHK028: `<details>` stored as toggle block in CRDT, not raw HTML.
- CHK029: Inline footnote `^[text]` exports as reference-style `[^N]: text` for GFM compatibility.
- CHK030: Both inline `%%text%%` and multi-line `%%\ntext\n%%` comment forms supported, both apply `comment: true`.
- CHK031: URL autolink fires on Space or Enter (both), consistent with wikilink and highlight triggers.
- CHK033: Tag search query format is `tag:<canonical-lowercase-name>`.
- CHK034: Tags export as plain `#tag-name` text.
- CHK035: Tag display preserves original casing; matching/deduplication uses canonical lowercase.

## Assumptions

- Embed blocks (iframe-based embeds for external services such as Figma, Loom, etc.) are explicitly out of scope for this feature.
- Wikilinks resolve against AFFiNE workspace pages by title. Block-level references (`[[Note#^block-id]]`) fall back to the containing note if the specific block cannot be located; this is acceptable degraded behaviour.
- Clicking a tag opens the workspace search pre-filtered to that tag. This relies on the existing search infrastructure; no new tag index is required for this feature.
- File attachments and media uploads are not addressed in this feature; the scope is limited to inline text and structural formatting.
- The editor's existing block model is assumed to be capable of representing all required block types (callouts, toggles, tables, code blocks) — this spec does not require a fundamental block model redesign.
- Concurrent editing conflicts on all new markdown-rendered elements (checkboxes, callouts, tables, etc.) are resolved by the existing CRDT model (last-write-wins), consistent with all other AFFiNE blocks. No additional conflict UI is required.
- LaTeX math rendering relies on an existing or to-be-integrated math typesetting library; the choice of library is an implementation decision outside this spec.
- Syntax highlighting language detection for unlabelled code blocks (auto-detect) is a nice-to-have and not a hard requirement.
- **Callout schema migration**: Existing `affine:callout` blocks that were created before this feature are treated as having `calloutType = null`, `foldable = false`, and `folded = false` by default. No explicit migration is required — the block renderer reads these props with their default values when absent, preserving existing callout appearance unchanged.
- **Malformed table rendering**: For pasted tables with missing pipes or mismatched columns (S6 scenario 4), "best-effort" means all parseable columns and rows are rendered; the editor MUST NOT crash or produce a completely empty output. Columns that cannot be parsed are omitted; at least the content of the first complete row MUST be visible.
- **WCAG 2.1 AA scope**: The SC-009 contrast requirement applies independently to both light and dark themes — a colour token that passes in light mode must also pass in dark mode. Combined (single-theme) checks are not sufficient.
- **`folded` CRDT semantics**: The `folded` boolean (toggled by clicking a foldable callout) uses last-write-wins semantics (LWW-register), consistent with all other boolean props in the y-octo CRDT model.
- **Accessibility baseline assumption**: The existing BlockSuite editor infrastructure is assumed to provide a baseline-compliant DOM structure (semantic HTML, tab order, focus management for existing blocks). The new FRs (FR-046–FR-055) require only incremental additions to that baseline for net-new elements; they do not require a full audit or rewrite of existing editor accessibility.
- **Accessibility evaluation method**: SC-009 and FR-046 are validated by: (1) automated axe-core scan with no critical or serious violations for net-new elements, and (2) manual spot-check with NVDA+Firefox and VoiceOver+Safari for the five highest-priority interactions (wikilink resolution, callout fold/unfold, footnote navigation, tag activation, source mode toggle). A full assistive-technology matrix test is not required for this iteration.
- **Non-text contrast scope**: FR-046 and SC-009 extend to non-text contrast (WCAG SC 1.4.11) for UI component boundaries introduced by this feature. Existing editor elements not modified by this feature are out of scope.
- **Task list non-standard states (FR-025a) accessible semantics**: Non-standard checked characters (`[?]`, `[-]`) are rendered with the same `checked` semantic as `[x]` — a binary checked/unchecked accessible state is sufficient. Communicating the specific character to assistive technology is not required.
- **Nested callout ARIA structure**: Nested callouts (FR-028b) do not require a heading hierarchy or ARIA landmark nesting. Each callout is a self-contained `role="note"` or `role="complementary"` region; nesting is conveyed by DOM containment, which is sufficient for screen reader navigation.
- **Dynamic wikilink resolution accessibility**: When a wikilink resolves from unresolved to resolved state while a screen reader user has focus on it, the accessible name update (FR-050b) is sufficient. A proactive ARIA live-region announcement of the resolution event is not required — the user will encounter the updated name when they re-visit the element.
- **Forced-colours / High Contrast mode**: The callout colour tokens, highlight colours, and unresolved link dashed underline are required to remain distinguishable in `forced-colors: active` mode. The dashed underline MUST be expressed in CSS border/text-decoration (not box-shadow or outline alone) so it is preserved under forced colours. Specific `@media (forced-colors: active)` overrides are an implementation concern; the spec requires that the non-colour distinguishers (icon, underline style) survive the mode.
- **Round-trip canonical source of truth**: AFFiNE's internal CRDT representation is the authoritative source of truth. Markdown export is a serialisation of the CRDT state. If a re-import cycle produces a document that differs from the original CRDT state only in ways listed as tolerated normalisation (SC-008: trailing newlines, blank-line count), the round-trip is considered passing. The exported markdown does not define canonical state.
- **Round-trip import adapter dependency**: SC-008's re-import direction depends on the existing markdown import adapter recognising all FR-042 syntax types on input. This is an explicit assumption: the import adapter is assumed to handle the full set of FR-042 serialised forms (wikilinks, callouts, comments, highlights, toggles as `<details>`, etc.) on paste. Any FR-042 syntax type that the import adapter cannot parse on input is a separate bug in the import adapter, not a round-trip fidelity failure.
- **Round-trip scope — source mode**: SC-008's round-trip requirement covers documents regardless of which mode they were authored in. Content produced in source mode and viewed in live preview is subject to the same SC-008 guarantee on the next export-import cycle. The live-preview → source → live-preview cycle is separately governed by contracts/inline-extensions.md §6; both obligations must hold independently.
- **Round-trip scope — partial documents**: SC-008 applies to whole-document export-import cycles. Copying a subset of blocks, pasting into an external tool, and re-pasting into AFFiNE is explicitly out of scope for SC-008 — the clipboard intermediate may be any markdown tool that does not honour AFFiNE-specific extensions. Partial-paste fidelity is best-effort only.
- **Round-trip scope — external tools**: SC-008 is an AFFiNE→AFFiNE requirement. The exported GFM/Obsidian markdown is designed to be readable in other tools (Obsidian, GitHub), but fidelity in third-party tools is not a requirement of this spec — it is a quality-of-life goal.
- **Round-trip — empty/degenerate blocks**: Empty blocks (callout with no body, task list with no items, footnote with no content) MUST NOT be omitted or collapsed on export. They MUST be serialised as their appropriate empty syntax (e.g. a callout with no body exports as `> [!TYPE]\n>` with an empty body line). This ensures round-trip fidelity for degenerate cases.
- **Round-trip — delimiter-conflict characters**: Wikilink targets that contain `|`, `[`, or `]` characters MUST be percent-encoded or escaped in export (implementation detail). Tag names that contain `/` at multiple levels are exported as nested tag syntax `#parent/child`. The spec does not enumerate all possible escape strategies; the implementation MUST NOT silently truncate or lose content due to delimiter conflicts.
- **Round-trip — mixed inline formatting (same span)**: When a single text span has both `highlight` and `comment` attributes, the export MUST preserve both independently. The serialisation order is: outermost `%%` (comment), then `==` (highlight): `%%==text==%% `. However, a `comment: true` span is invisible in live preview and hidden from the accessibility tree; a span that is both highlighted and commented is an edge case with undefined visual behaviour — the spec does not require a specific rendering for this combination in live preview, only that both attributes are serialised on export.
- **Round-trip — large documents**: SC-008's correctness guarantee applies regardless of document size. The plan.md 500ms serialisation performance target is a non-functional aspiration (not a correctness requirement); correctness (no content loss) is unconditional.
- **Round-trip — per-type measurability (SC-008)**: "Retains all formatting" in SC-008 means, per type: code blocks — language identifier and content are byte-for-byte identical; mermaid — diagram source is syntactically identical (not merely functionally equivalent); math — export may normalise `$$...$$` and ` ```math ` to a single canonical form (`$$...$$`) — preserving original entry-point syntax is not required; tables — all rows, columns, and alignment markers are preserved; task lists — checkbox states (`[ ]` / `[x]`) preserved (non-standard chars normalised to `[x]` per FR-025a); footnotes — all reference labels and definition text preserved; autolinks — URL preserved byte-for-byte.
- **Round-trip — source mode and SC-008 vs contracts §6 consistency**: SC-008 (export-import round-trip) and contracts/inline-extensions.md §6 (live-preview→source→live-preview cycle) are distinct mechanisms with the same content-fidelity obligation. SC-008 tests the markdown adapter; §6 tests the source mode parser. Both must pass independently. Passing SC-008 does not guarantee §6 and vice versa.
- **Paste path — universal coverage**: All functional requirements (FR-001–FR-041) apply equally to pasted content and to live-typed content. The markdown/HTML import adapter handles pasted text; the inline extension trigger (e.g. Space after `==`, `]]` typed) applies only to live-typed input. On paste, the import adapter recognises completed syntax patterns regardless of how they arrived — there is no separate "paste mode" requirement. This assumption applies to all Obsidian constructs (inline formatting, wikilinks, callouts, tags, comments, footnotes, code blocks, tables, task lists, block quotes, headings, horizontal rules) and all Notion HTML block types.
- **Obsidian clipboard format**: Pasted Obsidian content arrives as plain UTF-8 markdown text (Obsidian copies using the `text/plain` MIME type with markdown syntax). No Obsidian-proprietary binary or metadata format is involved. This is the foundation for all SC-002 and FR-008/FR-026/etc. paste requirements.
- **Notion clipboard format**: Pasted Notion content arrives as HTML (Notion copies using the `text/html` MIME type). The paste handler reads the HTML clipboard entry and routes it through an HTML-to-block converter. A separate HTML import adapter (distinct from the markdown import adapter) performs this conversion. If both `text/html` and `text/plain` are present (as is typical), the HTML entry takes precedence. This is the foundation for all SC-003 and Notion-block-type paste requirements.
- **HTML import adapter (Notion paste path)**: A dedicated HTML-to-AFFiNE-block adapter handles Notion HTML paste. This adapter is architecturally distinct from the markdown import adapter (which handles Obsidian paste and SC-008 re-import). The HTML adapter converts the following HTML elements to the corresponding AFFiNE blocks: `<h1>`–`<h6>` → heading blocks; `<strong>`/`<b>` → bold attribute; `<em>`/`<i>` → italic attribute; `<code>` (inline) → inline code attribute; `<pre><code>` → code block (language from `class="language-X"`); `<blockquote>` → block quote; `<ul><li>` → bulleted list; `<ol><li>` → numbered list; `<li><input type="checkbox">` → task list item; `<table>` → table block; `<details><summary>` → toggle block (same path as FR-031); Notion callout div → AFFiNE callout block (fallback type "note"; see Notion callout assumption below); `<hr>` → horizontal rule; `<mark>` or Notion background-colour span → highlight attribute using `var(--affine-highlight-yellow)` (colour fidelity from Notion's palette to AFFiNE's tokens is best-effort; see highlight colour mapping assumption).
- **Notion callout HTML import**: Notion exports callouts as a `<div>` with a specific class and an emoji/icon prefix. The HTML import adapter recognises Notion's callout div structure and converts it to an AFFiNE callout block. The callout type defaults to "note" (the same fallback as FR-027 for unrecognised Obsidian callout types). The emoji/icon prefix is not mapped to a callout type; type mapping for Notion callouts is best-effort and out of scope for exact parity. SC-003's "callouts" claim relies on this adapter path.
- **Notion highlight colour mapping**: Notion's highlighted text uses named colours (yellow, blue, green, red, etc.). When pasted, all Notion highlight colours are mapped to AFFiNE's nearest highlight token. The exact mapping is an implementation detail; the spec does not require colour-exact fidelity between Notion and AFFiNE highlight palettes. Any visible highlighting is sufficient to satisfy SC-003 for this block type.
- **Notion mention blocks excluded**: Notion "mention" blocks (page mentions `@Page`, person mentions `@Person`, date mentions `@Date`) are explicitly excluded from SC-003's 90% target. They are treated as plain text on paste. This is an explicit out-of-scope decision, not a gap.
- **Notion unsupported block types**: Notion block types with no AFFiNE equivalent (database views, gallery, board, timeline, linked database, synced block, breadcrumb) are silently dropped on paste — they produce no output, no error block, and no user-visible indication. This is acceptable degraded behaviour and does not count against the SC-003 90% target (these types are not in the 90% base).
- **SC-003 Notion block type reference set**: The 90% base for SC-003 is the following 11 block types: paragraph, heading (H1–H3), bulleted list, numbered list, toggle/collapsible, code block, quote/blockquote, callout, divider/horizontal rule, table, to-do/task list. Inline formatting (bold, italic, inline code, highlight) is treated as a cross-cutting attribute across these types, not a separate block type. "90% correct" means at least 10 of the 11 types paste with the correct AFFiNE block structure and visible formatting. Embeds are explicitly excluded (per Overview).
- **SC-002 Obsidian construct reference set**: The 95% base for SC-002 is the following 20 constructs: bold, italic, bold-italic, strikethrough, highlight, inline code, wikilink (basic), wikilink (alias), wikilink (heading anchor), wikilink (block ref), URL autolink, standard markdown link, code block (fenced with language), mermaid diagram, math (inline `$`), math (display `$$`), table (GFM pipe), task list, callout (all 11 types), foldable callout (`-`/`+`), nested callout, footnote (reference-style), inline footnote (`^[text]`), comment (`%%`), tag (basic), tag (nested `#/`), block quote, heading (H1–H6), horizontal rule, unordered/ordered list. "95% correct" means at least 19 of 20 construct categories paste with correct AFFiNE block/inline structure.
- **"Renders correctly" definition (SC-002, SC-003)**: For the purposes of SC-002 and SC-003, "renders correctly" means: the pasted content produces the same AFFiNE CRDT block type and inline attribute structure as if the user had typed the same syntax live in live-preview mode. Visual equivalence alone (same appearance but different CRDT structure) is not sufficient. This is a structural fidelity requirement, consistent with SC-008.
- **S2 scenario 3 "all wikilinks" definition**: In User Story 2 scenario 3 ("all wikilinks are converted"), "all" means 100% of syntactically valid `[[...]]` wikilinks in the pasted content. A single missed wikilink is a bug, not within tolerance. This is stricter than SC-002's 95% — the 95% applies to the overall Obsidian construct set, not to individual instances within a single paste.
- **Wikilink anchor paste fall-back**: When a pasted `[[Page Name#Heading]]` anchor cannot be resolved (the heading does not exist in the target page), the link falls back to a note-level wikilink (`[[Page Name]]`) in the same unresolved/resolved state as the note. The heading anchor is silently dropped; no error indicator is shown. This is the same graceful degradation as FR-008b for block refs.
- **Block reference fall-back visual state**: When `[[Note#^block-id]]` falls back to a note-level link (FR-008b), the link's visual state (resolved or unresolved) is determined by whether the target note exists, not whether the specific block exists. A note-level resolved link (dashed underline absent) is the result when the note is found, regardless of whether the block ID matched.
- **Obsidian embed syntax fallback**: Obsidian embed syntax (`![[image.png]]`, `![[Note]]`) is out of scope (embeds are excluded per Overview). When pasted Obsidian content contains embed syntax, it is rendered as plain text (the raw `![[...]]` string is preserved as-is). No error block is shown; no conversion is attempted.
- **Paste path for inline footnotes**: Pasted `^[text]` inline footnote syntax (FR-034a) is recognised by the markdown import adapter on paste. The adapter converts it to a reference-style footnote inline + definition pair in the CRDT, identical to the export form. The result on paste is the same as if the user had typed the inline footnote syntax live.
- **Paste path universality — no per-construct triggers**: Unlike live-typed input (where each construct has a specific trigger character: Space, `]]`, etc.), pasted content is processed by the import adapter in a single pass after the paste event. The adapter applies all recognition rules simultaneously. No per-construct paste trigger is defined; the presence of valid syntax in the pasted text is the sole recognition criterion.
- **Mixed Obsidian+Notion paste conflict resolution**: When content containing both Obsidian markdown syntax and Notion HTML markup is pasted in the same operation, the clipboard `text/html` entry takes precedence (HTML adapter runs first). Any markdown syntax embedded as text content within the HTML is treated as literal text, not re-parsed as markdown. Conflicting parses do not occur because the two adapters run exclusively on separate clipboard MIME types.
- **Nested Notion block paste**: Nested Notion block structures (e.g. toggle containing a table containing a task list) are parsed recursively by the HTML adapter. Each recognised block type at each nesting level is converted independently. Nesting fidelity is required for the 11 SC-003 block types; the spec does not require nesting fidelity for unsupported block types.
- **Partial Obsidian construct paste**: Partial or malformed Obsidian syntax in pasted content (e.g. `[[Page Nam` with no closing `]]`, or `> [!NOTE` with no closing) is treated as plain text by the import adapter. The adapter does not attempt partial resolution or produce an error block; the raw text is preserved as-is. This is consistent with the malformed table best-effort assumption.
- **Obsidian scope limited to OFM syntax**: "Obsidian constructs" in SC-002 are limited to Obsidian Flavored Markdown (OFM) syntax — the constructs enumerated in the SC-002 reference set above. Obsidian custom CSS snippets, theme-specific visual extensions, and Obsidian plugin output that is not standard OFM syntax are explicitly out of scope.
- **Wikilink delimiter-conflict import**: When a pasted wikilink contains `|`, `[`, or `]` in the title (e.g. `[[Table|of|Contents]]`), the import adapter uses the last `|` as the alias separator (matching Obsidian's behaviour). Characters within the title that are not `|` are treated as literal title characters. The `[` and `]` within a wikilink target are treated as literal characters (the outer `[[...]]` delimiters are the boundary). Loss of content due to delimiter ambiguity is not acceptable.
- **Obsidian comment syntax priority**: Obsidian comment syntax (`%% ... %%`) takes precedence over any markdown syntax contained within it. Content inside `%% ... %%` delimiters is NOT parsed for wikilinks, callouts, or any other inline/block constructs — it is treated as opaque comment text. This applies on both the typed and paste paths.
- **SC-003 round-trip after Notion paste**: SC-008's round-trip fidelity requirement applies to all AFFiNE documents, including those that originated from Notion paste. Once Notion HTML has been converted to AFFiNE CRDT blocks, those blocks are subject to the same SC-008 round-trip guarantee as any other AFFiNE-authored content. SC-008 is not limited to AFFiNE-originated content.
