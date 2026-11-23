import {
  DocModeProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher } from '@blocksuite/global/lit';
import { DoneIcon } from '@blocksuite/icons/lit';
import { css, html } from 'lit';

import { EmbedIframeLinkInputBase } from './embed-iframe-link-input-base';

export class EmbedIframeLinkEditPopup extends SignalWatcher(
  EmbedIframeLinkInputBase
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

  protected override track(status: 'success' | 'failure') {
    this.telemetryService?.track('EditLink', {
      type: 'embed iframe block',
      page: this.editorMode === 'page' ? 'doc editor' : 'whiteboard editor',
      segment: 'editor',
      module: 'embed block',
      control: 'edit button',
      result: status,
    });
  }

  override render() {
    const isInputEmpty = this.isInputEmpty();
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
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
          />
        </div>
        <div
          class="confirm-button"
          ?disabled=${isInputEmpty}
          @click=${this.onConfirm}
        >
          ${DoneIcon({ width: '24px', height: '24px' })}
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
}
