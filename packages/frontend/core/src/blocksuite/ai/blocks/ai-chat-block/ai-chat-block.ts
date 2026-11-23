import { Peekable } from '@blocksuite/affine/components/peek';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine/ext-loader';
import { BlockComponent } from '@blocksuite/affine/std';
import { computed } from '@preact/signals-core';
import { html } from 'lit';

import { ChatMessagesSchema } from '../../components/ai-chat-messages';
import type { TextRendererOptions } from '../../components/text-renderer';
import { ChatWithAIIcon } from './components/icon';
import { type AIChatBlockModel } from './model';
import { AIChatBlockStyles } from './styles';

@Peekable({
  enableOn: ({ store }: AIChatBlockComponent) => {
    // Disable on mobile and readonly mode
    return !BUILD_CONFIG.isMobileEdition && !store.readonly;
  },
})
export class AIChatBlockComponent extends BlockComponent<AIChatBlockModel> {
  static override styles = AIChatBlockStyles;

  private _textRendererOptions: TextRendererOptions = {};

  // Deserialize messages from JSON string and verify the type using zod
  private readonly _deserializeChatMessages = computed(() => {
    const messages = this.model.props.messages$.value;
    try {
      const result = ChatMessagesSchema.safeParse(JSON.parse(messages));
      if (result.success) {
        return result.data;
      } else {
        return [];
      }
    } catch {
      return [];
    }
  });

  override connectedCallback() {
    super.connectedCallback();
    this._textRendererOptions = {
      customHeading: true,
      extensions: this.previewExtensions,
    };
  }

  override renderBlock() {
    const messages = this._deserializeChatMessages.value.slice(-2);

    return html`<div class="affine-ai-chat-block-container">
      <div class="ai-chat-messages-container">
        <ai-chat-block-messages
          .host=${this.host}
          .messages=${messages}
          .textRendererOptions=${this._textRendererOptions}
          .withMask=${true}
        ></ai-chat-block-messages>
      </div>
      <div class="ai-chat-block-button">
        ${ChatWithAIIcon} <span>AI chat block</span>
      </div>
    </div> `;
  }

  get previewExtensions() {
    return this.std.get(ViewExtensionManagerIdentifier).get('preview-page');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-ai-chat': AIChatBlockComponent;
  }
}
