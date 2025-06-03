import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

export class ChatContentPureText extends ShadowlessElement {
  static override styles = css`
    .chat-content-pure-text {
      display: inline-block;
      text-align: left;
      max-width: 100%;
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

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-content-pure-text';

  stopPropagation(event: Event) {
    event.stopPropagation();
  }

  protected override render() {
    return this.text.length > 0
      ? // prettier-ignore
        html`<div class="chat-content-pure-text" @copy=${this.stopPropagation}>${this.text}</div>`
      : nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-content-pure-text': ChatContentPureText;
  }
}
