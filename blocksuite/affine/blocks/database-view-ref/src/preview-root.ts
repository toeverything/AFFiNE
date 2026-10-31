import { PageKeyboardManager } from '@blocksuite/affine-block-root';
import { BlockComponent, BlockViewIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { css, html } from 'lit';
import { literal } from 'lit/static-html.js';

/**
 * Near-identical to `database-ref/src/preview-root.ts`'s own
 * `DatabaseRefPreviewRootBlockComponent`/`DatabaseRefPreviewRootOverride` —
 * same reasoning applies unchanged: `preview-page`'s stock root hides any
 * `EdgelessOnly` note, exactly where the hidden canonical database lives
 * (see `commands.ts`'s `ensurePromoted`/`moveIntoHiddenNote`, reused
 * directly from `@blocksuite/affine-block-database-ref`).
 */
export class DatabaseViewRefPreviewRootBlockComponent extends BlockComponent {
  static override styles = css`
    affine-database-view-ref-preview-root {
      display: block;
    }
  `;

  // Unlike the real `PageRootBlockComponent` this is a stand-in for, this
  // component never wired up `PageKeyboardManager` — the same pre-existing
  // gap `note-ref/src/preview-root.ts` already documents and fixes for its
  // own preview root (Story 0.5). Its absence means every keybinding
  // `PageKeyboardManager` provides for an ordinary page — most reported
  // live: Mod-z/Shift-Mod-z (undo/redo) on a cross-doc List view (Journal
  // Todo) row edit — silently did nothing while editing here, since
  // nothing on this nested scope's own root component ever called
  // `.undo()`/`.redo()` on its own `store` (the referenced database's
  // preview `Store`, not the outer page's) at all. `PageKeyboardManager`'s
  // constructor only needs a `BlockComponent` (`.bindHotKey`, `.store`,
  // `.host.selection` — all present here, same as on the real root), so
  // this is a direct, like-for-like port of `note-ref`'s own fix.
  keyboardManager: PageKeyboardManager | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.keyboardManager = new PageKeyboardManager(this);
  }

  override renderBlock() {
    const widgets = html`${Object.values(this.widgets)}`;
    const children = this.renderChildren(this.model);
    return html`<div class="affine-database-view-ref-preview-root">
      ${children} ${widgets}
    </div>`;
  }
}

if (!customElements.get('affine-database-view-ref-preview-root')) {
  customElements.define(
    'affine-database-view-ref-preview-root',
    DatabaseViewRefPreviewRootBlockComponent
  );
}

export const DatabaseViewRefPreviewRootOverride: ExtensionType = {
  setup: di => {
    di.override(
      BlockViewIdentifier('affine:page'),
      () => literal`affine-database-view-ref-preview-root`
    );
  },
};
