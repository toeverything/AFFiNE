import { type EmbedIframeBlockModel } from '@blocksuite/affine-model';
import { EmbedIframeService } from '@blocksuite/affine-shared/services';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { isValidUrl, stopPropagation } from '@blocksuite/affine-shared/utils';
import { BlockSelection, type BlockStdScope } from '@blocksuite/block-std';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { DoneIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';

export class EmbedIframeLinkEditPopup extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    .embed-iframe-link-edit-popup {
      display: flex;
      padding: 12px;
      align-items: center;
      gap: 12px;
      color: var(--affine-text-primary-color);
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: ${unsafeCSSVarV2('layer/background/primary')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};

      .input-container {
        display: flex;
        width: 280px;
        align-items: center;
        border: 1px solid var(--affine-border-color);
        border-radius: 4px;
        padding: 0 8px;
        background-color: var(--affine-background-color);
        gap: 8px;

        .input-label {
          color: var(--affine-text-secondary-color);
          font-size: 14px;
          margin-right: 8px;
          white-space: nowrap;
        }

        .link-input {
          flex: 1;
          border: none;
          outline: none;
          padding: 8px 0;
          background: transparent;
          font-size: 14px;
        }
      }

      .input-container:focus-within {
        border-color: var(--affine-blue-700);
        outline: none;
      }

      .confirm-button {
        cursor: pointer;
        display: flex;
        padding: 2px;
        justify-content: center;
        align-items: center;
        color: ${unsafeCSSVarV2('icon/activated')};
      }

      .confirm-button[disabled] {
        color: ${unsafeCSSVarV2('icon/primary')};
      }
    }
  `;

  /**
   * Try to add a bookmark model and remove the current embed iframe model
   * @param url The url to add as a bookmark
   */
  private readonly _tryToAddBookmark = (url: string) => {
    if (!isValidUrl(url)) {
      // notify user that the url is invalid
      console.warn('can not add bookmark', url);
      return;
    }

    const { model } = this;
    const { parent } = model;
    const index = parent?.children.indexOf(model);
    const flavour = 'affine:bookmark';

    this.store.transact(() => {
      const blockId = this.store.addBlock(flavour, { url }, parent, index);

      this.store.deleteBlock(model);
      this.std.selection.setGroup('note', [
        this.std.selection.create(BlockSelection, { blockId }),
      ]);
    });

    this.abortController.abort();
  };

  private readonly _onConfirm = () => {
    if (this._isInputEmpty()) {
      return;
    }

    const canEmbed = this.EmbedIframeService.canEmbed(this._linkInputValue);
    // If the url is not embeddable, try to add it as a bookmark
    if (!canEmbed) {
      console.warn('can not embed', this._linkInputValue);
      this._tryToAddBookmark(this._linkInputValue);
      return;
    }

    // Update the embed iframe model
    this.store.updateBlock(this.model, {
      url: this._linkInputValue,
      iframeUrl: '',
      title: '',
      description: '',
    });

    this.abortController.abort();
  };

  private readonly _handleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    this._linkInputValue = target.value;
  };

  private readonly _isInputEmpty = () => {
    return this._linkInputValue.trim() === '';
  };

  private readonly _handleKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      this._onConfirm();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.updateComplete
      .then(() => {
        requestAnimationFrame(() => {
          this.input.focus();
        });
      })
      .catch(console.error);
    this.disposables.addFromEvent(this, 'cut', stopPropagation);
    this.disposables.addFromEvent(this, 'copy', stopPropagation);
    this.disposables.addFromEvent(this, 'paste', stopPropagation);
  }

  override render() {
    const isInputEmpty = this._isInputEmpty();
    const { url$ } = this.model.props;

    return html`
      <div class="embed-iframe-link-edit-popup">
        <div class="input-container">
          <span class="input-label">Link</span>
          <input
            class="link-input"
            type="text"
            spellcheck="false"
            placeholder=${url$.value}
            @input=${this._handleInput}
            @keydown=${this._handleKeyDown}
          />
        </div>
        <div
          class="confirm-button"
          ?disabled=${isInputEmpty}
          @click=${this._onConfirm}
        >
          ${DoneIcon({ width: '24px', height: '24px' })}
        </div>
      </div>
    `;
  }

  get store() {
    return this.model.doc;
  }

  get EmbedIframeService() {
    return this.store.get(EmbedIframeService);
  }

  @state()
  private accessor _linkInputValue = '';

  @query('input')
  accessor input!: HTMLInputElement;

  @property({ attribute: false })
  accessor model!: EmbedIframeBlockModel;

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
