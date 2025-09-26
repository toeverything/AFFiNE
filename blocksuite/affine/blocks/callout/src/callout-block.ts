import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import { type CalloutBlockModel, DefaultTheme } from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import {
  DocModeProvider,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
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
      align-items: flex-start;
      padding: 5px 10px;
      border-radius: 8px;
    }

    .affine-callout-emoji-container {
      user-select: none;
      font-size: 1.2em;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 10px;
      margin-bottom: 10px;
      flex-shrink: 0;
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
        .onEmojiSelect=${(data: { native: string }) => {
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

  private readonly _handleBlockClick = (event: MouseEvent) => {
    // Check if the click target is emoji related element
    const target = event.target as HTMLElement;
    if (
      target.closest('.affine-callout-emoji-container') ||
      target.classList.contains('affine-callout-emoji')
    ) {
      return;
    }

    // Only handle clicks when there are no children
    if (this.model.children.length > 0) {
      return;
    }

    // Prevent event bubbling
    event.stopPropagation();

    // Create a new paragraph block
    const paragraphId = this.store.addBlock('affine:paragraph', {}, this.model);

    // Focus the new paragraph
    focusTextModel(this.std, paragraphId);
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
    const background = this.model.props.background$.value;

    const themeProvider = this.std.get(ThemeProvider);
    const theme = themeProvider.theme$.value;
    const backgroundColor = themeProvider.generateColorProperty(
      background || DefaultTheme.NoteBackgroundColorMap.White,
      DefaultTheme.NoteBackgroundColorMap.White,
      theme
    );

    return html`
      <div
        class="affine-callout-block-container"
        @click=${this._handleBlockClick}
        style=${styleMap({
          backgroundColor: backgroundColor,
        })}
      >
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
