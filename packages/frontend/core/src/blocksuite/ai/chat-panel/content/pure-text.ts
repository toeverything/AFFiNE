import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

export class ChatContentPureText extends ShadowlessElement {
  static override styles = css`
    .chat-content-pure-text {
      display: inline-block;
      text-align: left;
      max-width: 800px;
      max-height: 500px;
      overflow-y: auto;
      overflow-x: hidden;
      background: ${unsafeCSSVarV2('aI/userTextBackground')};
      border-radius: 8px;
      padding: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      scrollbar-width: auto;
    }

    .chat-content-pure-text::-webkit-scrollbar {
      width: 4px;
    }

    .chat-content-pure-text::-webkit-scrollbar-thumb {
      background-color: ${unsafeCSSVar('borderColor')};
      border-radius: 3px;
    }

    .chat-content-pure-text::-webkit-scrollbar-track {
      background: transparent;
    }
  `;

  @property({ attribute: false })
  accessor text: string = '';

  protected override render() {
    return this.text.length > 0
      ? html`<div class="chat-content-pure-text">${this.text}</div>`
      : nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-content-pure-text': ChatContentPureText;
  }
}
