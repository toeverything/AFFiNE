import '../content/assistant-avatar';
import '../content/rich-text';

import type { EditorHost } from '@blocksuite/affine/block-std';
import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { isInsidePageEditor } from '@blocksuite/affine/shared/utils';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import {
  EdgelessEditorActions,
  PageEditorActions,
} from '../../_common/chat-actions-handle';
import { type AIError } from '../../components/ai-item/types';
import { AIChatErrorRenderer } from '../../messages/error';
import { type ChatMessage, isChatMessage } from '../chat-context';

export class ChatMessageAssistant extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .message-info {
      color: var(--affine-placeholder-color);
      font-size: var(--affine-font-xs);
      font-weight: 400;
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor item!: ChatMessage;

  @property({ attribute: false })
  accessor isLast: boolean = false;

  @property({ attribute: false })
  accessor status: string = 'idle';

  @property({ attribute: false })
  accessor error: AIError | null = null;

  @property({ attribute: false })
  accessor previewSpecBuilder: any;

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor retry!: () => void;

  renderHeader() {
    const isWithDocs =
      'content' in this.item &&
      this.item.content &&
      this.item.content.includes('[^') &&
      /\[\^\d+\]:{"type":"doc","docId":"[^"]+"}/.test(this.item.content);

    return html`<div class="user-info">
      <chat-assistant-avatar></chat-assistant-avatar>
      ${isWithDocs
        ? html`<span class="message-info">with your docs</span>`
        : nothing}
    </div>`;
  }

  renderContent() {
    const { host, item, isLast, status, error } = this;

    if (isLast && status === 'loading') {
      return html`<ai-loading></ai-loading>`;
    }

    const state = isLast
      ? status !== 'loading' && status !== 'transmitting'
        ? 'finished'
        : 'generating'
      : 'finished';
    const shouldRenderError = isLast && status === 'error' && !!error;

    return html`
      ${item.attachments
        ? html`<chat-content-images
            .images=${item.attachments}
          ></chat-content-images>`
        : nothing}
      <chat-content-rich-text
        .host=${host}
        .text=${item.content}
        .state=${state}
        .previewSpecBuilder=${this.previewSpecBuilder}
      ></chat-content-rich-text>
      ${shouldRenderError ? AIChatErrorRenderer(host, error) : nothing}
      ${this.renderEditorActions()}
    `;
  }

  renderEditorActions() {
    const { item, isLast, status } = this;

    if (!isChatMessage(item) || item.role !== 'assistant') return nothing;

    if (
      isLast &&
      status !== 'success' &&
      status !== 'idle' &&
      status !== 'error'
    )
      return nothing;

    const { host } = this;
    const { content, id: messageId } = item;

    const actions = isInsidePageEditor(host)
      ? PageEditorActions
      : EdgelessEditorActions;

    return html`
      <chat-copy-more
        .host=${host}
        .actions=${actions}
        .content=${content}
        .isLast=${isLast}
        .getSessionId=${this.getSessionId}
        .messageId=${messageId}
        .withMargin=${true}
        .retry=${() => this.retry()}
      ></chat-copy-more>
      ${isLast && !!content
        ? html`<chat-action-list
            .actions=${actions}
            .host=${host}
            .content=${content}
            .getSessionId=${this.getSessionId}
            .messageId=${messageId ?? undefined}
            .withMargin=${true}
          ></chat-action-list>`
        : nothing}
    `;
  }

  protected override render() {
    return html`
      ${this.renderHeader()}
      <div class="item-wrapper">${this.renderContent()}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-message-assistant': ChatMessageAssistant;
  }
}
