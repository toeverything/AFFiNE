import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import { type CalloutBlockModel } from '@blocksuite/affine-model';
import { NOTE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { BlockComponent } from '@blocksuite/block-std';
import { flip, offset } from '@floating-ui/dom';
import { css, html } from 'lit';
import { query } from 'lit/decorators.js';
export class CalloutBlockComponent extends CaptionedBlockComponent<CalloutBlockModel> {
  static override styles = css`
    :host {
      display: block;
      margin: 8px 0;
    }

    .affine-callout-block-container {
      display: flex;
      padding: 12px 16px;
      border-radius: 8px;
      background-color: ${unsafeCSSVarV2('block/callout/background/grey')};
    }

    .affine-callout-emoji-container {
      margin-right: 12px;
      margin-top: 10px;
      user-select: none;
      font-size: 1.2em;
    }
    .affine-callout-emoji:hover {
      cursor: pointer;
      opacity: 0.7;
    }

    .affine-callout-children {
      flex: 1;
      min-width: 0;
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
      return this.closest<BlockComponent>(NOTE_SELECTOR);
    }
    return this.rootComponent;
  }

  override renderBlock() {
    return html`
      <div class="affine-callout-block-container">
        <div
          @click=${this._toggleEmojiMenu}
          contenteditable="false"
          class="affine-callout-emoji-container"
        >
          <span class="affine-callout-emoji">${this.model.props.emoji$}</span>
        </div>
        <div class="affine-callout-children">
          ${this.renderChildren(this.model)}
        </div>
      </div>
    `;
  }
}
