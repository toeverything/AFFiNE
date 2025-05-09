import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { type ChatAction } from '../../components/ai-chat-messages';

export class ActionImageToText extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: false })
  accessor host!: EditorHost;

  protected override render() {
    const answer = this.item.messages[1].attachments;

    return html`<action-wrapper .host=${this.host} .item=${this.item}>
      <div
        style=${styleMap({
          marginBottom: '12px',
        })}
      >
        ${answer
          ? html`<chat-content-images
              data-testid="original-images"
              .images=${answer}
            ></chat-content-images>`
          : nothing}
      </div>
    </action-wrapper>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-image-to-text': ActionImageToText;
  }
}
