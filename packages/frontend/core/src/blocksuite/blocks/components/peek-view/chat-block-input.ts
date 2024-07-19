import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('chat-block-input')
export class ChatBlockInput extends LitElement {
  static override styles = css`
    :host {
      width: 100%;
    }

    .ai-chat-input {
      width: 100%;
      min-height: 100px;
      padding: 8px 12px;
      box-sizing: border-box;
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      position: relative;
      background-color: var(--affine-white-10);
    }

    .ai-chat-input {
      textarea {
        width: 100%;
        padding: 0;
        margin: 0;
        border: none;
        line-height: 22px;
        font-size: var(--affine-font-sm);
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-text-primary-color);
        box-sizing: border-box;
        resize: none;
        overflow-y: hidden;
        background-color: transparent;
      }

      textarea::placeholder {
        font-size: 14px;
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-placeholder-color);
      }

      textarea:focus {
        outline: none;
      }
    }
  `;

  override render() {
    return html` <div class="ai-chat-input">
      <textarea rows="1" placeholder="What are your thoughts?"></textarea>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-block-input': ChatBlockInput;
  }
}
