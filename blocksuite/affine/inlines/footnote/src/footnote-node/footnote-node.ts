import { HoverController } from '@blocksuite/affine-components/hover';
import type { FootNote } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import {
  BlockSelection,
  type BlockStdScope,
  ShadowlessElement,
  TextSelection,
} from '@blocksuite/block-std';
import {
  INLINE_ROOT_ATTR,
  type InlineRootElement,
  ZERO_WIDTH_NON_JOINER,
  ZERO_WIDTH_SPACE,
} from '@blocksuite/block-std/inline';
import { WithDisposable } from '@blocksuite/global/lit';
import type { DeltaInsert } from '@blocksuite/store';
import { shift } from '@floating-ui/dom';
import { baseTheme } from '@toeverything/theme';
import { css, html, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit-html/directives/class-map.js';
import { ref } from 'lit-html/directives/ref.js';

import type { FootNoteNodeConfigProvider } from './footnote-config';

// Virtual padding for the footnote popup overflow detection offsets.
const POPUP_SHIFT_PADDING = 8;

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

  private readonly _FootNoteDefaultContent = (footnote: FootNote) => {
    return html`<span class="footnote-content-default"
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
          .onPopupClick=${this.onPopupClick}
        ></footnote-popup>`;
  };

  private readonly _whenHover: HoverController = new HoverController(
    this,
    ({ abortController }) => {
      const footnote = this.delta.attributes?.footnote;
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

      return {
        template: this._FootNotePopup(footnote, abortController),
        container: this,
        computePosition: {
          referenceElement: this,
          placement: 'top',
          autoUpdate: true,
          middleware: [shift({ padding: POPUP_SHIFT_PADDING })],
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
      >${node}<v-text .str=${ZERO_WIDTH_NON_JOINER}></v-text
    ></span>`;
  }

  @property({ attribute: false })
  accessor config: FootNoteNodeConfigProvider | undefined = undefined;

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_SPACE,
    attributes: {},
  };

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
