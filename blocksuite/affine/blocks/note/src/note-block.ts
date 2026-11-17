import type { NoteBlockModel } from '@blocksuite/affine-model';
import { NoteDisplayMode, resolveColor } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { BlockComponent } from '@blocksuite/std';
import { css, html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

export class NoteBlockComponent extends BlockComponent<NoteBlockModel> {
  static override styles = css`
    .affine-note-block-container {
      display: flow-root;
    }
    .affine-note-block-container.selected {
      background-color: var(--affine-hover-color);
    }
    .affine-note-block-container[data-page-border='true'] {
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      padding: 8px 16px;
      margin: 8px 0;
    }
  `;

  // A note otherwise has zero page-mode styling of its own.
  //
  // `pageBorder`'s *explicit* value (true or false), whenever one is set,
  // always wins outright — including on a note this component itself
  // considers "primary" — so a user can still deliberately style their own
  // page's background/border via the "Note Style" panel (not gated on
  // `isPageBlock()` either) if they want to.
  //
  // When `pageBorder` is genuinely unset (`undefined`), fall back to
  // `!isPageBlock()`. This matters for every doc that already existed
  // before this prop did: a brand-new doc's own primary note is given an
  // explicit `pageBorder: false` **at creation time**
  // (`EditorSettingDocCreateMiddleware.beforeCreate`, packages/frontend/
  // core) rather than ever being `undefined` — but an *existing* doc's
  // primary note has no such value and never will retroactively, so
  // without this fallback every legacy document's main content started
  // rendering with a border around the whole page the moment this
  // component stopped special-casing `isPageBlock()` outright. The
  // fallback is what makes both cases resolve correctly: new docs get an
  // explicit `false` (respected as-is), legacy docs get `undefined`
  // (falls through to the same borderless-for-primary default).
  //
  // `EdgelessOnly` notes are excluded regardless of their own prop value:
  // `database-ref`/`note-ref` render this exact component for a referenced
  // canonical's hidden `EdgelessOnly` ancestor-chain notes, which are never
  // genuinely "in the page" — without this, the border/padding bled
  // straight into every referenced table.
  private get _showBorder(): boolean {
    if (this.model.props.displayMode === NoteDisplayMode.EdgelessOnly) {
      return false;
    }
    if (this.model.props.pageBorder !== undefined) {
      return this.model.props.pageBorder;
    }
    return !this.model.isPageBlock();
  }

  private get _pageBackgroundOverride() {
    if (this.model.props.displayMode === NoteDisplayMode.EdgelessOnly) {
      return undefined;
    }
    return this.model.props.pageBackgroundOverride;
  }

  override renderBlock() {
    const pageBackgroundOverride = this._pageBackgroundOverride;
    const backgroundColor = pageBackgroundOverride
      ? resolveColor(
          pageBackgroundOverride,
          this.std.get(ThemeProvider).appTheme
        )
      : undefined;
    const style = styleMap({ backgroundColor });

    // `contentEditable` here is load-bearing, not decoration -- this is now
    // the ONE boundary between the page root (always `false`, see
    // `page-root-block.ts`'s `renderBlock()`) and the rich-text divs that
    // independently set their own `contenteditable="true"`
    // (`rich-text.ts`'s `render()`). A previous version of this fix set
    // `false` HERE unconditionally (on mobile only, later) to resolve the
    // original MOBILE-14 tap-to-edit hit-testing jump (nested true/true
    // between page root and rich-text was ambiguous) -- but that also
    // isolated every sibling block's rich-text into its own
    // `contenteditable="true"` island (true -> false -> true, true,
    // true...), which is exactly the DOM shape that blocks a native
    // drag-selection from extending across paragraphs/list items. Pushing
    // the single `false` boundary UP to the page root instead removes the
    // ambiguous tap target at its actual source while keeping every block
    // inside a note as one continuous editable region on every platform.
    this.contentEditable = String(!this.store.readonly$.value);

    return html`
      <div
        class="affine-note-block-container"
        data-page-border=${this._showBorder}
        style=${style}
      >
        <div class="affine-block-children-container">
          ${this.renderChildren(this.model)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-note': NoteBlockComponent;
  }
}
