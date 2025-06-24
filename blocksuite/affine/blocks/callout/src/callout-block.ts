import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import { type CalloutBlockModel } from '@blocksuite/affine-model';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { BlockComponent } from '@blocksuite/std';
import { flip, offset } from '@floating-ui/dom';
import { css, html } from 'lit';
import { query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
export class CalloutBlockComponent extends CaptionedBlockComponent<CalloutBlockModel> {
  static override styles = css`
    :host {
      display: block;
      margin: 8px 0;
    }

    .affine-callout-block-container {
      display: flex;
      padding: 5px 10px;
      border-radius: 8px;
      background-color: ${unsafeCSSVarV2('block/callout/background/grey')};
    }

    .affine-callout-emoji-container {
      margin-right: 10px;
      margin-top: 14px;
      user-select: none;
      font-size: 1.2em;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .affine-callout-emoji:hover {
      cursor: pointer;
      opacity: 0.7;
    }

    .affine-callout-children {
      flex: 1;
      min-width: 0;
      padding-left: 10px;
    }
  `;

  private _emojiMenuAbortController: AbortController | null = null;
  private readonly _toggleEmojiMenu = () => {
    if (this._emojiMenuAbortController) {
      this._emojiMenuAbortController.abort();
    }
    this._emojiMenuAbortController = new AbortController();

    const theme = this.std.get(ThemeProvider).theme$.value;

    createLitPortal({
      template: html`<affine-emoji-menu
        .theme=${theme}
        .onEmojiSelect=${(data: any) => {
          this.model.props.emoji = data.native;
        }}
      ></affine-emoji-menu>`,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: this.host,
      computePosition: {
        referenceElement: this._emojiButton,
        placement: 'bottom-start',
        middleware: [flip(), offset(4)],
        autoUpdate: { animationFrame: true },
      },
      abortController: this._emojiMenuAbortController,
      closeOnClickAway: true,
    });
  };

  get attributeRenderer() {
    return this.inlineManager.getRenderer();
  }

  get attributesSchema() {
    return this.inlineManager.getSchema();
  }

  get embedChecker() {
    return this.inlineManager.embedChecker;
  }

  get inlineManager() {
    return this.std.get(DefaultInlineManagerExtension.identifier);
  }

  @query('.affine-callout-emoji')
  private accessor _emojiButton!: HTMLElement;

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  override renderBlock() {
    const emoji = this.model.props.emoji$.value;
    return html`
      <div class="affine-callout-block-container">
        <div
          @click=${this._toggleEmojiMenu}
          contenteditable="false"
          class="affine-callout-emoji-container"
          style=${styleMap({
            display: emoji.length === 0 ? 'none' : undefined,
          })}
        >
          <span class="affine-callout-emoji">${emoji}</span>
        </div>
        <div class="affine-callout-children">
          ${this.renderChildren(this.model)}
        </div>
      </div>
    `;
  }
}
