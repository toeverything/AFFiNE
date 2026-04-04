# Page-Body Hashtag Badge Design

Date: 2026-04-04
Status: Approved for planning

## Summary

Render inline hashtag tokens such as `#todo` in page-body rich text as badge-like chips while keeping the stored document text unchanged.

The source of truth remains plain text. Typing, clipboard, history, adapters, and exports continue to operate on literal text like `hello #todo world`, not a structured tag node.

## Goals

- Render `#tag`-style tokens as badge-like inline UI in editable page-body text.
- Render the same badge styling in readonly views of the same page-body content.
- Preserve the underlying text exactly as typed.
- Keep cursor movement, selection, deletion, copy, and undo/redo behavior aligned with plain text.

## Non-goals

- Introducing a new document-level tag entity or schema.
- Adding tag metadata, indexing, autocomplete, filtering, or linking.
- Converting hashtags into embeds, mentions, or references.
- Changing markdown export, plain-text export, or clipboard payloads.
- Styling hashtags inside code blocks or other non-page-body rich-text surfaces in this iteration.

## User-visible Behavior

### Core rule

Any run of text that starts with `#` and is followed by one or more non-space characters is rendered as a badge until the next whitespace boundary.

Examples:

- `#todo` renders as a badge.
- `hello #todo world` renders `#todo` as a badge.
- `hello#todo` renders `#todo` as a badge starting at the `#`.
- `#todo,` remains part of the badge because punctuation does not terminate the token in this version.
- `# ` does not render as a badge because there is no text after `#`.

### Edit/read-only parity

The same badge treatment appears in editable and readonly page-body rendering. The visual treatment changes; the stored text does not.

### Interaction expectations

- Selecting badge text selects the underlying characters.
- Copying badge text copies literal text including `#`.
- Backspace/delete operate on characters, not on a structured token.
- Undo/redo works through normal text history.

## Scope

### Included

- Paragraph block rich text in document/page mode.
- List block rich text in document/page mode.
- Heading text in document/page mode, because headings are rendered by the paragraph block.
- Readonly rendering of the same document/page-mode paragraph and list content.

### Excluded

- Page title.
- Database title and rich-text cells.
- Code blocks and inline code rendering.
- Paragraph/list rendering outside document/page mode.
- Existing structured inline nodes such as links, mentions, references, footnotes, and latex.
- AI chat inputs and other non-page-body editors.

## Technical Design

### Design choice

Use a rendering-only solution, not a model change.

Instead of altering the stored delta or creating an embed node, page-body rich-text rendering will recognize hashtag substrings inside plain-text deltas and render those substrings with badge styling.

### Renderer boundary

Do not modify the global default inline manager used by all rich-text surfaces.

Instead, introduce a page-body-specific inline rendering path for paragraph/list blocks in document/page mode so the feature is limited to page-body content and does not leak into database cells, title fields, edgeless text, or other editors that currently reuse the default inline manager.

### Inline spec approach

Create a page-body-specific inline spec for plain text with hashtag content:

- It matches only non-embed text deltas that contain at least one renderable hashtag token.
- It does not change the delta schema.
- It renders the delta by splitting the literal string into alternating plain-text segments and hashtag segments.
- It preserves existing text styling attributes on the full delta for non-tag text and tag text.
- It remains compatible with wrapper specs such as comments by staying in the inline-spec pipeline rather than bypassing the manager entirely.

This page-body inline manager will be selected by paragraph and list blocks when the editor mode is `page`. Other modes keep using the existing default manager.

### Parsing rule

Initial parsing rule:

- Start a tag at any `#` character.
- Continue the tag while subsequent characters are not whitespace.
- Require at least one non-whitespace character after `#`.

Equivalent behavior can be implemented with a scanner or a regex-driven splitter. A scanner is preferred if it keeps the rendering code clearer and avoids edge-case regex backtracking.

### Rendering shape

For a matching plain-text delta:

1. Compute base text styles from the delta attributes.
2. Split the literal string into ordered segments.
3. Render normal segments as standard inline text nodes.
4. Render hashtag segments as inline badge spans that still contain normal text nodes with the original literal text.

The badge span must keep a real text node for the literal `#tag` content so range conversion, selection mapping, and clipboard behavior continue to track characters instead of synthetic token placeholders.

### Styling

Badge styling should be lightweight and text-safe:

- Inline-flex or inline-block appearance.
- Rounded border radius.
- Subtle background fill and readable foreground color.
- Small horizontal padding.
- No content replacement.
- No `contenteditable="false"`.

The badge should remain visually compact and align with surrounding inline text instead of behaving like an embed chip.

### Compatibility constraints

The inline editor’s range conversion logic depends on real text nodes found under `[data-v-text="true"]`. The design must therefore avoid:

- Replacing hashtag text with generated content only.
- Turning the badge into an embed.
- Removing the underlying text nodes from the rendered subtree.

The rendered DOM may wrap text nodes, but it must still expose the same literal characters through `v-text`.

## Error Handling And Guardrails

- If a delta is an embed or is rendered by a higher-priority structured inline spec, do not apply hashtag badge rendering.
- If a plain-text delta contains no valid hashtag token, fall back to normal rendering.
- If the segmenter encounters unexpected input, prefer rendering the raw text unchanged rather than throwing or dropping content.

## Testing Strategy

Write tests before implementation.

### Coverage

1. Editable rendering: typing `#todo ` shows a badge for `#todo` and plain text after the space.
2. Underlying text preservation: editor text value remains literal `#todo`.
3. Delimiter behavior: badge ends at the first whitespace boundary.
4. Mid-line behavior: `hello#todo world` renders only the `#todo` substring as a badge.
5. Selection/copy behavior: selecting across or inside a badge copies literal text.
6. Character deletion behavior: backspace/delete removes characters normally when the caret is adjacent to or inside a badge.
7. Readonly rendering: the same stored text shows badge styling in readonly page-body rendering.
8. Isolation: a non-page-body surface covered by the existing default inline manager does not gain badge rendering.

### Test levels

- Prefer targeted e2e tests in the existing BlockSuite editor test suite because the primary risk is DOM/range behavior, not pure string parsing.
- Add a small unit test for the segmenter if the parsing logic is extracted into a helper.

## Risks

- The largest risk is breaking inline selection and caret mapping if hashtag rendering removes or rearranges text nodes in a way the inline range utilities do not expect.
- A second risk is unintended scope expansion if the new spec is added to the shared default inline manager instead of a page-body-specific manager.
- A third risk is visual conflict with inline code, links, or comment wrappers; higher-priority structured specs and explicit exclusions should prevent this.

## Implementation Outline

1. Introduce a page-body-specific inline manager extension derived from the current default inline manager.
2. Add a hashtag-badge inline spec for plain text with renderable hashtag content.
3. Update paragraph and list blocks to select the page-body inline manager only in document/page mode.
4. Add tests for rendering, selection, copy, deletion, readonly behavior, and scope isolation.

## Open Decisions Resolved

- Hashtags remain plain text in storage.
- Rendering applies in editable and readonly views.
- Token termination is whitespace-based, not punctuation-based.
- The feature is scoped to page-body rich text rather than every rich-text surface in the product.
