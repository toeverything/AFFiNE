import { PageKeyboardManager } from '@blocksuite/affine-block-root';
import { BlockComponent, BlockViewIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { css, html } from 'lit';
import { literal } from 'lit/static-html.js';

/**
 * A near-copy of `PreviewRootBlockComponent` ('preview-page''s `affine:page`
 * view), minus its one hardcoded behavior that doesn't work for this use
 * case: it unconditionally skips any note whose `displayMode` is
 * `EdgelessOnly` (see `preview-root-block.ts`) — which is exactly the
 * displayMode the hidden host note this package relies on uses (see
 * `commands.ts`), specifically so it's invisible in the *real* page (which
 * goes through the same exclusion in `page-root-block.ts`). Reusing
 * `preview-page` as-is would silently hide the very thing this is meant to
 * render.
 *
 * `preview-edgeless` was tried first as a way around that (its root has no
 * such filter), but it turned out to carry its own baggage found only
 * through hands-on testing: `EdgelessRootPreviewBlockComponent` sets
 * `pointer-events: none` and pairs with `EdgelessLocker`
 * (`viewport.locked = true`) — both are correct for a genuine read-only
 * preview, but make the rendered database uneditable and its own menus
 * unclickable, and its `height: 100%` styling collapses to zero outside a
 * real full-height viewport container (a second, unrelated bug this
 * disagreement caused). Page-mode content sizes to its own content
 * naturally and has neither problem, so this custom root — registered
 * *after* the rest of `preview-page`'s extensions in `database-ref-block.ts`
 * so it wins the `affine:page` slot — is the actual fix: same interactive,
 * normally-sized rendering as any other page content, with only the one
 * exclusion removed.
 */
export class DatabaseRefPreviewRootBlockComponent extends BlockComponent {
  static override styles = css`
    affine-database-ref-preview-root {
      display: block;
    }
  `;

  // Unlike the real `PageRootBlockComponent` this is a stand-in for, this
  // component never wired up `PageKeyboardManager` — the same pre-existing
  // gap `note-ref/src/preview-root.ts` already documents and fixes for its
  // own preview root (Story 0.5), and which `database-view-ref/src/
  // preview-root.ts` (this file's near-identical sibling) shares byte for
  // byte. Its absence means every keybinding `PageKeyboardManager`
  // provides for an ordinary page — most reported live: Mod-z/Shift-Mod-z
  // (undo/redo) — silently did nothing while editing a cross-doc
  // referenced database here, since nothing on this nested scope's own
  // root component ever called `.undo()`/`.redo()` on its own `store`
  // (the referenced database's preview `Store`, not the outer page's) at
  // all. `PageKeyboardManager`'s constructor only needs a `BlockComponent`
  // (`.bindHotKey`, `.store`, `.host.selection` — all present here, same
  // as on the real root), so this is a direct, like-for-like port of
  // `note-ref`'s own fix.
  keyboardManager: PageKeyboardManager | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.keyboardManager = new PageKeyboardManager(this);
  }

  override renderBlock() {
    const widgets = html`${Object.values(this.widgets)}`;
    const children = this.renderChildren(this.model);
    return html`<div class="affine-database-ref-preview-root">
      ${children} ${widgets}
    </div>`;
  }
}

if (!customElements.get('affine-database-ref-preview-root')) {
  customElements.define(
    'affine-database-ref-preview-root',
    DatabaseRefPreviewRootBlockComponent
  );
}

/**
 * A single already-built `ExtensionType`, appended after the rest of
 * `preview-page`'s extensions (see `_previewSpec` in `database-ref-block.ts`)
 * so it overrides just its `affine:page` view registration
 * (`affine-preview-root`) with the filter-free root above — every other
 * registration from `preview-page` (database view, paragraph view, etc.) is
 * kept as-is.
 *
 * Uses `di.override` rather than the plain `BlockViewExtension` helper
 * (which calls `addImpl`, throwing "Service already exists" since
 * 'preview-page' already registers a view for `affine:page`) — this must
 * explicitly replace that prior registration, not add a competing one.
 */
export const DatabaseRefPreviewRootOverride: ExtensionType = {
  setup: di => {
    di.override(
      BlockViewIdentifier('affine:page'),
      () => literal`affine-database-ref-preview-root`
    );
  },
};
