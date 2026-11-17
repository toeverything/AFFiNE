import { PageKeyboardManager } from '@blocksuite/affine-block-root';
import { BlockComponent, BlockViewIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { css, html } from 'lit';
import { literal } from 'lit/static-html.js';

/**
 * A near-copy of `PreviewRootBlockComponent` ('preview-page''s `affine:page`
 * view), minus its one hardcoded behavior that doesn't work for this use
 * case: it unconditionally skips any note whose `displayMode` is
 * `EdgelessOnly` — which is exactly the displayMode every `note-ref`
 * canonical Note uses (`createReusableNoteAndInsertRefCommand`), so it's
 * invisible in the *real* page (via the identical exclusion in
 * `page-root-block.ts`). Reusing `preview-page` as-is would silently hide
 * the very thing this is meant to render.
 *
 * Only needed for a *cross-doc* reference (Story 0.5) — a same-doc
 * reference renders directly through the outer host's own already-active
 * `affine:page` view (see `note-ref-block.ts`'s same-doc path), never
 * mounting a nested scope of its own at all. Mirrors `database-ref`'s own
 * `DatabaseRefPreviewRootOverride` exactly, including the two wrong turns
 * that override's own doc comment records (`preview-edgeless`'s
 * `pointer-events: none`/viewport-lock baggage) — not re-litigated here,
 * same conclusion applies for the same reasons.
 */
export class NoteRefPreviewRootBlockComponent extends BlockComponent {
  static override styles = css`
    affine-note-ref-preview-root {
      display: block;
    }

    /*
     * The real page root's container is \`display: flex\`, which blockifies
     * its \`<affine-note>\` children; this plain block wrapper does not, so
     * without this the note keeps the custom-element default \`inline\`.
     * An inline editable wrapping block children has no usable box, and iOS
     * clamps taps inside the focused editable to that box, so after the
     * first tap the caret never moved again (999.15).
     */
    .affine-note-ref-preview-root > affine-note {
      display: block;
    }
  `;

  // Unlike the real `PageRootBlockComponent` this is a stand-in for, this
  // component never wired up `PageKeyboardManager` — a pre-existing gap
  // from when this file was first written, not something introduced by
  // any of this story's other fixes. Its absence means every keybinding
  // `PageKeyboardManager` provides for an ordinary page — most reported
  // live: Mod-z/Shift-Mod-z (undo/redo) — silently did nothing while
  // editing inside a cross-doc reference, since nothing on this nested
  // scope's own root component ever called `.undo()`/`.redo()` on its
  // own `store` at all. `PageKeyboardManager`'s own constructor only
  // needs a `BlockComponent` (`.bindHotKey`, `.store`, `.host.selection`
  // — all present here, same as on the real root), so this is a direct,
  // like-for-like port of `page-root-block.ts`'s own
  // `connectedCallback` wiring, not a new mechanism.
  keyboardManager: PageKeyboardManager | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.keyboardManager = new PageKeyboardManager(this);
  }

  override renderBlock() {
    const widgets = html`${Object.values(this.widgets)}`;
    const children = this.renderChildren(this.model);
    return html`<div class="affine-note-ref-preview-root">
      ${children} ${widgets}
    </div>`;
  }
}

if (!customElements.get('affine-note-ref-preview-root')) {
  customElements.define(
    'affine-note-ref-preview-root',
    NoteRefPreviewRootBlockComponent
  );
}

/**
 * A single already-built `ExtensionType`, appended after the rest of
 * `preview-page`'s extensions so it overrides just its `affine:page` view
 * registration (`affine-preview-root`) with the filter-free root above —
 * every other registration from `preview-page` (note view, paragraph view,
 * etc.) is kept as-is.
 *
 * Uses `di.override` rather than the plain `BlockViewExtension` helper
 * (which calls `addImpl`, throwing "Service already exists" since
 * 'preview-page' already registers a view for `affine:page`) — this must
 * explicitly replace that prior registration, not add a competing one.
 */
export const NoteRefPreviewRootOverride: ExtensionType = {
  setup: di => {
    di.override(
      BlockViewIdentifier('affine:page'),
      () => literal`affine-note-ref-preview-root`
    );
  },
};
