import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { EmptyIcon } from '@blocksuite/icons/lit';
import { css, html, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

import type { AIChatContent } from '../ai-chat-content';

function getChatPanel(target: HTMLElement) {
  return target.closest('ai-chat-content') as AIChatContent;
}

export const isPreviewPanelOpen = (target: HTMLElement) => {
  const chatPanel = getChatPanel(target);
  return chatPanel?.isPreviewPanelOpen ?? false;
};

export const renderPreviewPanel = (
  target: HTMLElement,
  content: TemplateResult<1>,
  controls?: TemplateResult<1>
) => {
  const chatPanel = getChatPanel(target);

  if (!chatPanel) {
    console.error('chat-panel not found');
    return;
  }

  const preview = html`<artifact-preview-panel
    .content=${content}
    .controls=${controls ?? nothing}
  ></artifact-preview-panel>`;
  chatPanel.openPreviewPanel(preview);
};

export const closePreviewPanel = (target: HTMLElement) => {
  const chatPanel = getChatPanel(target);

  if (!chatPanel) {
    console.error('chat-panel not found');
    return;
  }

  chatPanel.closePreviewPanel();
};

export class ArtifactPreviewPanel extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .artifact-panel-preview-root {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      padding: 16px;
    }

    .artifact-preview-panel {
      border-radius: 16px;
      background-color: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      height: 100%;
      overflow: hidden;
    }

    .artifact-panel-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 12px;
      height: 52px;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
    }

    .artifact-panel-title {
      font-size: 16px;
      font-weight: 600;
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .artifact-panel-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
      flex: 1;
    }

    .artifact-panel-close {
      margin-left: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      cursor: pointer;
      transition: background-color 0.2s ease-in-out;
      color: ${unsafeCSSVarV2('icon/secondary')};
    }

    .artifact-panel-content {
      overflow-y: auto;
      height: calc(100% - 52px);
      position: relative;
    }

    .artifact-panel-close:hover {
      background-color: ${unsafeCSSVarV2('layer/background/tertiary')};
    }
  `;

  @property({ attribute: false })
  accessor content: TemplateResult<1> | null = null;

  @property({ attribute: false })
  accessor controls: TemplateResult<1> | null = null;

  private readonly _handleClose = () => {
    closePreviewPanel(this);
  };

  protected override render() {
    return html`<div class="artifact-panel-preview-root">
      <div class="artifact-preview-panel">
        <div class="artifact-panel-header">
          <div class="artifact-panel-actions">
            ${this.controls ?? nothing}
            <icon-button
              class="artifact-panel-close"
              @click=${this._handleClose}
            >
              ${EmptyIcon({ width: '24', height: '24' })}
            </icon-button>
          </div>
        </div>
        <div class="artifact-panel-content">${this.content}</div>
      </div>
    </div>`;
  }
}
