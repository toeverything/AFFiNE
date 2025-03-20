import { EmbedIframeService } from '@blocksuite/affine-shared/services';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { isValidUrl, stopPropagation } from '@blocksuite/affine-shared/utils';
import type { BlockStdScope } from '@blocksuite/block-std';
import { WithDisposable } from '@blocksuite/global/lit';
import { CloseIcon, EmbedIcon } from '@blocksuite/icons/lit';
import type { BlockModel } from '@blocksuite/store';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

type EmbedModalVariant = 'default' | 'compact';

export class EmbedIframeCreateModal extends WithDisposable(LitElement) {
  static override styles = css`
    .embed-iframe-create-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }

    .embed-iframe-create-modal-mask {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    .modal-main-wrapper {
      position: relative;
      box-sizing: border-box;
      width: 340px;
      padding: 0 24px;
      border-radius: 12px;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      z-index: var(--affine-z-index-modal);
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }

    .modal-content-wrapper {
      display: flex;
      flex-direction: column;
    }

    .modal-close-button {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      color: var(--affine-icon-color);
      border-radius: 4px;
    }
    .modal-close-button:hover {
      background-color: var(--affine-hover-color);
    }

    .modal-content-header {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .icon-container {
        padding-top: 48px;
        padding-bottom: 16px;
        display: flex;
        justify-content: center;

        .icon-background {
          display: flex;
          width: 64px;
          height: 64px;
          justify-content: center;
          align-items: center;
          border-radius: 50%;
          background: var(--affine-background-secondary-color);
          color: ${unsafeCSSVarV2('icon/primary')};

          svg {
            width: 32px;
            height: 32px;
          }
        }
      }

      .title {
        /* Client/h6 */
        text-align: center;
        font-size: 18px;
        font-style: normal;
        font-weight: 600;
        line-height: 26px; /* 144.444% */
        letter-spacing: -0.24px;
        color: ${unsafeCSSVarV2('text/primary')};
      }
    }

    .description {
      margin-top: 8px;
      text-align: center;
      font-feature-settings:
        'liga' off,
        'clig' off;
      /* Client/xs */
      font-size: 12px;
      font-style: normal;
      font-weight: 400;
      line-height: 20px; /* 166.667% */
      color: ${unsafeCSSVarV2('text/secondary')};
    }

    .input-container {
      width: 100%;
      margin-top: 24px;

      .link-input {
        box-sizing: border-box;
        width: 100%;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        background: ${unsafeCSSVarV2('input/background')};
      }

      .link-input:focus {
        border-color: var(--affine-blue-700);
        box-shadow: var(--affine-active-shadow);
        outline: none;
      }
      .link-input::placeholder {
        color: var(--affine-placeholder-color);
      }
    }

    .button-container {
      display: flex;
      justify-content: center;
      padding: 20px 0px;

      .confirm-button {
        width: 100%;
        height: 32px;
        line-height: 32px;
        text-align: center;
        justify-content: center;
        align-items: center;
        border-radius: 8px;
        background: ${unsafeCSSVarV2('button/primary')};
        border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};

        color: ${unsafeCSSVarV2('button/pureWhiteText')};
        /* Client/xsMedium */
        font-size: 12px;
        font-style: normal;
        font-weight: 500;
        cursor: pointer;
      }

      .confirm-button[disabled] {
        opacity: 0.5;
      }
    }

    .modal-main-wrapper.compact {
      padding: 12px 16px;

      .modal-content-wrapper {
        gap: 0;

        .icon-container {
          padding: 0;

          .icon-background {
            width: 56px;
            height: 56px;

            svg {
              width: 28px;
              height: 28px;
            }
          }
        }

        .title {
          padding: 10px 0;
          font-weight: 500;
        }

        .link-input {
          padding: 10px;
          font-size: 17px;
          font-style: normal;
          font-weight: 400;
          letter-spacing: -0.43px;
        }

        .description,
        .input-container {
          margin-top: 0;
        }

        .title,
        .description {
          font-size: 17px;
          font-style: normal;
          line-height: 22px; /* 129.412% */
          letter-spacing: -0.43px;
        }

        .description {
          font-weight: 400;
          text-align: left;
          order: 2;
          padding: 10px 0;
          color: ${unsafeCSSVarV2('text/secondary')};
        }

        .input-container {
          order: 1;
        }
      }

      .button-container {
        padding: 4px 0;

        .confirm-button {
          height: 40px;
          line-height: 40px;
          font-size: 17px;
          font-style: normal;
          font-weight: 400;
          letter-spacing: -0.43px;
        }
      }
    }
  `;

  private readonly _onClose = () => {
    this.remove();
  };

  private readonly _isInputEmpty = () => {
    return this._linkInputValue.trim() === '';
  };

  private readonly _addBookmark = (url: string) => {
    if (!isValidUrl(url)) {
      // notify user that the url is invalid
      return;
    }

    const blockId = this.std.store.addBlock(
      'affine:bookmark',
      {
        url,
      },
      this.parentModel.id,
      this.index
    );

    return blockId;
  };

  private readonly _onConfirm = async () => {
    if (this._isInputEmpty()) {
      return;
    }

    try {
      const embedIframeService = this.std.get(EmbedIframeService);
      if (!embedIframeService) {
        console.error('iframe EmbedIframeService not found');
        return;
      }

      const url = this.input.value;
      // check if the url can be embedded
      const canEmbed = embedIframeService.canEmbed(url);
      // if can not be embedded, try to add as a bookmark
      if (!canEmbed) {
        console.log('iframe can not be embedded, add as a bookmark', url);
        this._addBookmark(url);
        return;
      }

      // create a new embed iframe block
      const embedIframeBlock = embedIframeService.addEmbedIframeBlock(
        {
          url,
        },
        this.parentModel.id,
        this.index
      );

      return embedIframeBlock;
    } catch (error) {
      console.error('Error in embed iframe creation:', error);
      return;
    } finally {
      this._onClose();
    }
  };

  private readonly _handleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    this._linkInputValue = target.value;
  };

  private readonly _handleKeyDown = async (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      await this._onConfirm();
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
    const { showCloseButton } = this;
    const { variant } = this;

    const modalMainWrapperClass = classMap({
      'modal-main-wrapper': true,
      compact: variant === 'compact',
    });

    return html`
      <div class="embed-iframe-create-modal">
        <div
          class="embed-iframe-create-modal-mask"
          @click=${this._onClose}
        ></div>
        <div class=${modalMainWrapperClass}>
          ${showCloseButton
            ? html`
                <div class="modal-close-button" @click=${this._onClose}>
                  ${CloseIcon({ width: '20', height: '20' })}
                </div>
              `
            : nothing}
          <div class="modal-content-wrapper">
            <div class="modal-content-header">
              <div class="icon-container">
                <div class="icon-background">${EmbedIcon()}</div>
              </div>
              <div class="title">Embed Link</div>
            </div>
            <div class="description">
              Works with links of PDFs, Google Drive, Google Maps, CodePen…
            </div>
            <div class="input-container">
              <input
                class="link-input"
                type="text"
                placeholder="Paste in https://…"
                @input=${this._handleInput}
                @keydown=${this._handleKeyDown}
              />
            </div>
          </div>
          <div class="button-container">
            <div
              class="confirm-button"
              @click=${this._onConfirm}
              ?disabled=${this._isInputEmpty()}
            >
              Confirm
            </div>
          </div>
        </div>
      </div>
    `;
  }

  @state()
  private accessor _linkInputValue = '';

  @query('input')
  accessor input!: HTMLInputElement;

  @property({ attribute: false })
  accessor parentModel!: BlockModel;

  @property({ attribute: false })
  accessor index: number | undefined = undefined;

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  @property({ attribute: false })
  accessor onConfirm: () => void = () => {};

  @property({ attribute: false })
  accessor showCloseButton: boolean = true;

  @property({ attribute: false })
  accessor variant: EmbedModalVariant = 'default';
}

export async function toggleEmbedIframeCreateModal(
  std: BlockStdScope,
  createOptions: {
    parentModel: BlockModel;
    index?: number;
    variant?: EmbedModalVariant;
  }
): Promise<void> {
  std.selection.clear();

  const embedIframeCreateModal = new EmbedIframeCreateModal();
  embedIframeCreateModal.std = std;
  embedIframeCreateModal.parentModel = createOptions.parentModel;
  embedIframeCreateModal.index = createOptions.index;
  embedIframeCreateModal.variant = createOptions.variant ?? 'default';

  document.body.append(embedIframeCreateModal);

  return new Promise(resolve => {
    embedIframeCreateModal.onConfirm = () => resolve();
  });
}
