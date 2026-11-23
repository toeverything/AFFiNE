import {
  NoteDisplayMode,
  ParagraphBlockModel,
  RootBlockModel,
} from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  type EditorHost,
  PropTypes,
  requiredProperties,
} from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import { getHeadingBlocksFromDoc } from './utils/query.js';
import {
  observeActiveHeadingDuringScroll,
  scrollToBlockWithHighlight,
} from './utils/scroll.js';

export const AFFINE_MOBILE_OUTLINE_MENU = 'affine-mobile-outline-menu';

@requiredProperties({
  editor: PropTypes.object,
})
export class MobileOutlineMenu extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    :host {
      position: relative;
      display: flex;
      max-height: 100%;
      box-sizing: border-box;
      flex-direction: column;
      align-items: flex-start;
      padding: 0 12px;
    }

    :host::-webkit-scrollbar {
      display: none;
    }

    .outline-menu-item {
      display: inline;
      align-items: center;
      align-self: stretch;
      padding: 11px 8px;
      overflow: hidden;
      color: ${unsafeCSSVarV2('text/primary')};
      text-overflow: ellipsis;
      /* Body/Regular */
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 17px;
      font-style: normal;
      font-weight: 400;
      line-height: 22px;
      letter-spacing: -0.43px;
      white-space: nowrap;
    }

    .outline-menu-item.active {
      color: ${unsafeCSSVarV2('text/emphasis')};
    }

    .outline-menu-item:active {
      background: var(--affine-hover-color);
    }

    .outline-menu-item.title,
    .outline-menu-item.h1 {
      padding-left: 8px;
    }

    .outline-menu-item.h2 {
      padding-left: 28px;
    }

    .outline-menu-item.h3 {
      padding-left: 48px;
    }

    .outline-menu-item.h4 {
      padding-left: 68px;
    }

    .outline-menu-item.h5 {
      padding-left: 88px;
    }

    .outline-menu-item.h6 {
      padding-left: 108px;
    }
  `;

  private readonly _activeHeadingId$ = signal<string | null>(null);

  private _highlightMaskDisposable = () => {};

  private _lockActiveHeadingId = false;

  private async _scrollToBlock(blockId: string) {
    this._lockActiveHeadingId = true;
    this._activeHeadingId$.value = blockId;
    this._highlightMaskDisposable = await scrollToBlockWithHighlight(
      this.editor,
      blockId
    );
    this._lockActiveHeadingId = false;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.add(
      observeActiveHeadingDuringScroll(
        () => this.editor,
        newHeadingId => {
          if (this._lockActiveHeadingId) return;
          this._activeHeadingId$.value = newHeadingId;
        }
      )
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._highlightMaskDisposable();
  }

  renderItem = (item: BlockModel) => {
    let className = '';
    let text = '';
    if (matchModels(item, [RootBlockModel])) {
      className = 'title';
      text = item.props.title$.value.toString();
    } else if (
      matchModels(item, [ParagraphBlockModel]) &&
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(item.props.type$.value)
    ) {
      className = item.props.type$.value;
      text = item.props.text$.value.toString();
    } else {
      return nothing;
    }

    return html`<div
      class=${classMap({
        'outline-menu-item': true,
        [className]: true,
        active: this._activeHeadingId$.value === item.id,
      })}
      @click=${() => {
        this._scrollToBlock(item.id).catch(console.error);
      }}
    >
      ${text}
    </div>`;
  };

  override render() {
    const docModeService = this.editor.std.get(DocModeProvider);
    const mode = docModeService.getEditorMode();
    if (this.editor.store.root === null || mode === 'edgeless') return nothing;

    const headingBlocks = getHeadingBlocksFromDoc(
      this.editor.store,
      [NoteDisplayMode.DocAndEdgeless, NoteDisplayMode.DocOnly],
      true
    );

    if (headingBlocks.length === 0) return nothing;

    const items = [
      ...(this.editor.store.meta?.title !== '' ? [this.editor.store.root] : []),
      ...headingBlocks,
    ];

    return repeat(items, block => block.id, this.renderItem);
  }

  @property({ attribute: false })
  accessor editor!: EditorHost;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_MOBILE_OUTLINE_MENU]: MobileOutlineMenu;
  }
}
