import './action-wrapper';

import type { EditorHost } from '@blocksuite/block-std';
import { ShadowlessElement } from '@blocksuite/block-std';
import { MiniMindmapPreview } from '@blocksuite/blocks';
import { noop, WithDisposable } from '@blocksuite/global/utils';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { ChatAction } from '../chat-context';

noop(MiniMindmapPreview);

export class ActionMindmap extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: false })
  accessor host!: EditorHost;

  protected override render() {
    const answer = this.item.messages[2].content;
    return html`<action-wrapper .host=${this.host} .item=${this.item}>
      <div style=${styleMap({ marginBottom: '12px', height: '140px' })}>
        <mini-mindmap-preview
          .host=${this.host}
          .ctx=${{
            get: () => ({}),
            set: () => {},
          }}
          .answer=${answer}
          .templateShow=${false}
          .height=${140}
        ></mini-mindmap-preview>
      </div>
    </action-wrapper>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-mindmap': ActionMindmap;
  }
}
