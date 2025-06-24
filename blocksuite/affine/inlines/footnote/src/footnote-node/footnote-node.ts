import { HoverController } from '@blocksuite/affine-components/hover';
import { PeekViewProvider } from '@blocksuite/affine-components/peek';
import type { FootNote } from '@blocksuite/affine-model';
import { CitationProvider } from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  BlockSelection,
  type BlockStdScope,
  ShadowlessElement,
  TextSelection,
} from '@blocksuite/std';
import {
  INLINE_ROOT_ATTR,
  type InlineRootElement,
  ZERO_WIDTH_FOR_EMBED_NODE,
  ZERO_WIDTH_FOR_EMPTY_LINE,
} from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { flip, offset, shift } from '@floating-ui/dom';
import { baseTheme } from '@toeverything/theme';
import { css, html, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit-html/directives/class-map.js';
import { ref } from 'lit-html/directives/ref.js';

import type { FootNoteNodeConfigProvider } from './footnote-config';

// Virtual padding for the footnote popup overflow detection offsets.
const POPUP_SHIFT_PADDING = 8;
// The offset between the footnote node and the popup.
const POPUP_OFFSET = 4;

export class AffineFootnoteNode extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .footnote-node {
      padding: 0 2px;
      user-select: none;
      cursor: pointer;
    }

    .footnote-node {
      .footnote-content-default {
        display: inline-block;
        background: ${unsafeCSSVarV2('block/footnote/numberBgHover')};
        color: ${unsafeCSSVarV2('button/pureWhiteText')};
        width: 14px;
        height: 14px;
        line-height: 14px;
        font-size: 10px;
        font-weight: 400;
        border-radius: 50%;
        text-align: center;
        text-overflow: ellipsis;
        font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
        transition: background 0.3s ease-in-out;
        transform: translateY(-0.2em);
      }
    }

    .footnote-node.hover-effect {
      .footnote-content-default {
        color: var(--affine-text-primary-color);
        background: ${unsafeCSSVarV2('block/footnote/numberBg')};
      }
    }

    .footnote-node.hover-effect:hover {
      .footnote-content-default {
        color: ${unsafeCSSVarV2('button/pureWhiteText')};
        background: ${unsafeCSSVarV2('block/footnote/numberBgHover')};
      }
    }
  `;

  get customNodeRenderer() {
    return this.config?.customNodeRenderer;
  }

  get customPopupRenderer() {
    return this.config?.customPopupRenderer;
  }

  get interactive() {
    return this.config?.interactive;
  }

  get hidePopup() {
    return this.config?.hidePopup;
  }

  get disableHoverEffect() {
    return this.config?.disableHoverEffect;
  }

  get onPopupClick() {
    return this.config?.onPopupClick;
  }

  get inlineEditor() {
    const inlineRoot = this.closest<InlineRootElement<AffineTextAttributes>>(
      `[${INLINE_ROOT_ATTR}]`
    );
    return inlineRoot?.inlineEditor;
  }

  get selfInlineRange() {
    const selfInlineRange = this.inlineEditor?.getInlineRangeFromElement(this);
    return selfInlineRange;
  }

  get footnote() {
    return this.delta.attributes?.footnote;
  }

  get readonly() {
    return this.std.store.readonly;
  }

  get citationService() {
    return this.std.get(CitationProvider);
  }

  onFootnoteClick = () => {
    if (!this.footnote) {
      return;
    }
    const { type, docId, url } = this.footnote.reference;

    switch (type) {
      case 'doc':
        if (docId) {
          this._handleDocReference(docId);
        }
        break;
      case 'url':
        if (url) {
          this._handleUrlReference(url);
        }
        break;
    }
  };

  private readonly _handleDocReference = (docId: string) => {
    this.std
      .getOptional(PeekViewProvider)
      ?.peek({
        docId,
      })
      .catch(console.error);
  };

  private readonly _handleUrlReference = (url: string) => {
    window.open(url, '_blank');
  };

  private readonly _updateFootnoteAttributes = (footnote: FootNote) => {
    if (!this.footnote || this.readonly) {
      return;
    }

    if (!this.inlineEditor || !this.selfInlineRange) {
      return;
    }

    this.inlineEditor.formatText(this.selfInlineRange, {
      footnote: footnote,
    });
  };

  private readonly _FootNoteDefaultContent = (footnote: FootNote) => {
    return html`<span
      class="footnote-content-default"
      @click=${this.onFootnoteClick}
      >${footnote.label}</span
    >`;
  };

  private readonly _FootNotePopup = (
    footnote: FootNote,
    abortController: AbortController
  ) => {
    return this.customPopupRenderer
      ? this.customPopupRenderer(footnote, this.std, abortController)
      : html`<footnote-popup
          .footnote=${footnote}
          .std=${this.std}
          .abortController=${abortController}
          .onPopupClick=${this.onPopupClick ?? this.onFootnoteClick}
          .updateFootnoteAttributes=${this._updateFootnoteAttributes}
        ></footnote-popup>`;
  };

  private readonly _whenHover: HoverController = new HoverController(
    this,
    ({ abortController }) => {
      const { footnote } = this;
      if (!footnote) return null;

      if (
        this.config?.hidePopup ||
        !this.selfInlineRange ||
        !this.inlineEditor
      ) {
        return null;
      }

      const selection = this.std?.selection;
      if (!selection) {
        return null;
      }
      const textSelection = selection.find(TextSelection);
      if (!!textSelection && !textSelection.isCollapsed()) {
        return null;
      }

      const blockSelections = selection.filter(BlockSelection);
      if (blockSelections.length) {
        return null;
      }

      this.citationService.trackEvent('Hover', {
        control: 'Source Footnote',
      });

      return {
        template: this._FootNotePopup(footnote, abortController),
        container: this.std.host,
        computePosition: {
          referenceElement: this,
          placement: 'top',
          autoUpdate: true,
          middleware: [
            shift({ padding: POPUP_SHIFT_PADDING }),
            flip(),
            offset(POPUP_OFFSET),
          ],
        },
      };
    },
    { enterDelay: 300 }
  );

  override render() {
    const attributes = this.delta.attributes;
    const footnote = attributes?.footnote;
    if (!footnote) {
      return nothing;
    }

    const node = this.customNodeRenderer
      ? this.customNodeRenderer(footnote, this.std)
      : this._FootNoteDefaultContent(footnote);

    const nodeClasses = classMap({
      'footnote-node': true,
      'hover-effect': !this.disableHoverEffect,
    });

    return html`<span
      ${this.hidePopup ? '' : ref(this._whenHover.setReference)}
      class=${nodeClasses}
      >${node}<v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
    ></span>`;
  }

  @property({ attribute: false })
  accessor config: FootNoteNodeConfigProvider | undefined = undefined;

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
    attributes: {},
  };

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
