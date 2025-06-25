import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { type ChatAction } from '../../components/ai-chat-messages';

export class ActionImage extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'action-image';

  protected override render() {
    const images =
      this.item.messages[1]?.attachments ?? this.item.messages[0].attachments;

    return html`<action-wrapper .host=${this.host} .item=${this.item}>
      <div style=${styleMap({ marginBottom: '12px' })}>
        ${images
          ? html`<chat-content-images
              .images=${images}
              data-testid="original-image"
            ></chat-content-images>`
          : nothing}
      </div>
    </action-wrapper>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-image': ActionImage;
  }
}
