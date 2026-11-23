import './action-wrapper';

import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { type ChatAction } from '../../components/ai-chat-messages';
import { createIframeRenderer } from '../../messages/wrapper';

export class ActionMakeReal extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: false })
  accessor host!: EditorHost;

  protected override render() {
    const answer = this.item.messages[2].content;
    return html`<action-wrapper .host=${this.host} .item=${this.item}>
      <div style=${styleMap({ marginBottom: '12px' })}>
        ${createIframeRenderer(this.host)(answer, 'finished')}
      </div>
    </action-wrapper>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-make-real': ActionMakeReal;
  }
}
