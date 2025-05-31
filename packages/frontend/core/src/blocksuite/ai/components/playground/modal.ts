import { ShadowlessElement } from '@blocksuite/affine/std';
import { CloseIcon } from '@blocksuite/icons/lit';
import { css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * A modal component for AI Playground
 */
export class PlaygroundModal extends ShadowlessElement {
  static override styles = css`
    playground-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
      background-color: rgba(0, 0, 0, 0.4);
    }

    .playground-modal-container {
      position: relative;
      width: 90%;
      height: 90%;
      background-color: var(--affine-background-primary-color);
      border-radius: 12px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .playground-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--affine-border-color);
    }

    .playground-modal-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--affine-text-primary-color);
    }

    .playground-modal-close {
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
    }

    .playground-modal-close:hover {
      background-color: var(--affine-hover-color);
    }

    .playground-modal-content {
      flex: 1;
      overflow-y: auto;
    }
  `;

  private _close() {
    this.remove();
    this.onClose?.();
  }

  private readonly _handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this._close();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._handleKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown);
  }

  override render() {
    return html`
      <div class="playground-modal-container">
        <div class="playground-modal-header">
          <div class="playground-modal-title">${this.modalTitle}</div>
          <div @click="${this._close}" class="playground-modal-close">
            ${CloseIcon()}
          </div>
        </div>
        <div class="playground-modal-content">${this.content}</div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor modalTitle: string = '';

  @property({ attribute: false })
  accessor content: TemplateResult = html`
    <div>Welcome to the AI Playground!</div>
  `;

  @property({ attribute: false })
  accessor onClose: (() => void) | undefined = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'playground-modal': PlaygroundModal;
  }
}

/**
 * Creates and displays a modal with the provided content
 */
export const createPlaygroundModal = (
  content: TemplateResult,
  title: string
) => {
  // Create the modal element
  const modal = document.createElement('playground-modal') as PlaygroundModal;
  modal.modalTitle = title;
  modal.content = content;

  // Add the modal to the document body
  document.body.append(modal);

  return modal;
};
