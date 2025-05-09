import {
  DocModeProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { CloseIcon } from '@blocksuite/icons/lit';
import { baseTheme } from '@toeverything/theme';
import { css, html, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { EmbedIframeLinkInputBase } from './embed-iframe-link-input-base';

type EmbedLinkInputPopupVariant = 'default' | 'mobile';

export type EmbedLinkInputPopupOptions = {
  showCloseButton?: boolean;
  variant?: EmbedLinkInputPopupVariant;
  title?: string;
  description?: string;
  placeholder?: string;
  telemetrySegment?: string;
};

const DEFAULT_OPTIONS: EmbedLinkInputPopupOptions = {
  showCloseButton: false,
  variant: 'default',
  title: 'Embed Link',
  description: 'Works with links of Google Drive, Spotify…',
  placeholder: 'Paste the Embed link...',
  telemetrySegment: 'editor',
};

export class EmbedIframeLinkInputPopup extends EmbedIframeLinkInputBase {
  static override styles = css`
    .link-input-popup-main-wrapper {
      box-sizing: border-box;
      width: 340px;
      padding: 12px;
      border-radius: 8px;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }

    .link-input-popup-content-wrapper {
      display: flex;
      flex-direction: column;
    }

    .popup-close-button {
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
    .popup-close-button:hover {
      background-color: var(--affine-hover-color);
    }

    .title {
      /* Client/h6 */
      font-size: var(--affine-font-base);
      font-style: normal;
      font-weight: 500;
      line-height: 24px;
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .description {
      margin-top: 4px;
      font-feature-settings:
        'liga' off,
        'clig' off;
      font-size: var(--affine-font-sm);
      font-style: normal;
      font-weight: 400;
      line-height: 22px;
      color: ${unsafeCSSVarV2('text/secondary')};
    }

    .input-container {
      width: 100%;
      margin-top: 12px;
      box-sizing: border-box;

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
        color: ${unsafeCSSVarV2('text/placeholder')};
      }
    }

    .button-container {
      display: flex;
      justify-content: center;
      margin-top: 12px;

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

    .link-input-popup-main-wrapper.mobile {
      width: 360px;
      border-radius: 22px;
      padding: 12px 0;

      .popup-close-button {
        top: 20px;
        right: 16px;
      }

      .link-input-popup-content-wrapper {
        gap: 0;

        .title {
          padding: 10px 16px;
          font-weight: 500;
        }

        .input-container {
          padding: 4px 12px;
        }

        .link-input {
          padding: 11px 10px;
          font-size: 17px;
          font-style: normal;
          font-weight: 400;
          letter-spacing: -0.43px;
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
          padding: 11px 16px;
          color: ${unsafeCSSVarV2('text/secondary')};
        }

        .input-container {
          order: 1;
        }
      }

      .description,
      .input-container,
      .button-container {
        margin-top: 0;
      }

      .button-container {
        padding: 4px 16px;

        .confirm-button {
          height: 40px;
          line-height: 40px;
          font-size: 17px;
          font-style: normal;
          font-weight: 400;
          letter-spacing: -0.43px;
        }

        .confirm-button[disabled] {
          opacity: 1;
          background: ${unsafeCSSVarV2('button/disable')};
        }
      }
    }
  `;

  private readonly _onClose = () => {
    this.abortController?.abort();
  };

  protected override track(status: 'success' | 'failure') {
    this.telemetryService?.track('CreateEmbedBlock', {
      type: 'embed iframe block',
      page: this.editorMode === 'page' ? 'doc editor' : 'whiteboard editor',
      segment: this.options?.telemetrySegment ?? 'editor',
      module: 'embed block',
      control: 'confirm embed link',
      result: status,
    });
  }

  override render() {
    const options = { ...DEFAULT_OPTIONS, ...this.options };
    const { showCloseButton, variant, title, description, placeholder } =
      options;

    const modalMainWrapperClass = classMap({
      'link-input-popup-main-wrapper': true,
      mobile: variant === 'mobile',
    });

    return html`
      <div class=${modalMainWrapperClass}>
        ${showCloseButton
          ? html`
              <div class="popup-close-button" @click=${this._onClose}>
                ${CloseIcon({ width: '20', height: '20' })}
              </div>
            `
          : nothing}
        <div class="link-input-popup-content-wrapper">
          <div class="title">${title}</div>
          <div class="description">${description}</div>
          <div class="input-container">
            <input
              class="link-input"
              type="text"
              placeholder=${ifDefined(placeholder)}
              @input=${this.handleInput}
              @keydown=${this.handleKeyDown}
            />
          </div>
        </div>
        <div class="button-container">
          <div
            class="confirm-button"
            @click=${this.onConfirm}
            ?disabled=${this.isInputEmpty()}
          >
            Confirm
          </div>
        </div>
      </div>
    `;
  }

  get telemetryService() {
    return this.std.getOptional(TelemetryProvider);
  }

  get editorMode() {
    const docModeService = this.std.get(DocModeProvider);
    const mode = docModeService.getEditorMode();
    return mode ?? 'page';
  }

  @property({ attribute: false })
  accessor options: EmbedLinkInputPopupOptions | undefined = undefined;
}
