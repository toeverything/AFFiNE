import type { EditorHost } from '@blocksuite/affine/block-std';
import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { SpecBuilder } from '@blocksuite/affine/shared/utils';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import { createTextRenderer } from '../../components/text-renderer';

export class ChatContentRichText extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor text!: string;

  @property({ attribute: false })
  accessor state: 'finished' | 'generating' = 'finished';

  @property({ attribute: false })
  accessor previewSpecBuilder!: SpecBuilder;

  protected override render() {
    const { text, host } = this;
    return html`${createTextRenderer(host, {
      customHeading: true,
      extensions: this.previewSpecBuilder.value,
    })(text, this.state)}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-content-rich-text': ChatContentRichText;
  }
}
