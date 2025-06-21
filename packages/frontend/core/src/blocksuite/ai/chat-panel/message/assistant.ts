import '../content/assistant-avatar';
import '../content/rich-text';

import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { isInsidePageEditor } from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import {
  EdgelessEditorActions,
  PageEditorActions,
} from '../../_common/chat-actions-handle';
import {
  type ChatMessage,
  type ChatStatus,
  isChatMessage,
  type StreamObject,
} from '../../components/ai-chat-messages';
import { AIChatErrorRenderer } from '../../messages/error';
import { type AIError } from '../../provider';
import { mergeStreamContent } from '../../utils/stream-objects';

export class ChatMessageAssistant extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .message-info {
      color: var(--affine-placeholder-color);
      font-size: var(--affine-font-xs);
      font-weight: 400;
    }

    .reasoning-wrapper {
      padding: 16px 20px;
      margin: 8px 0;
      border-radius: 8px;
      background-color: rgba(0, 0, 0, 0.05);
    }

    .tool-wrapper {
      padding: 12px;
      margin: 8px 0;
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor item!: ChatMessage;

  @property({ attribute: false })
  accessor isLast: boolean = false;

  @property({ attribute: 'data-status', reflect: true })
  accessor status: ChatStatus = 'idle';

  @property({ attribute: false })
  accessor error: AIError | null = null;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor retry!: () => void;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-message-assistant';

  renderHeader() {
    const isWithDocs =
      'content' in this.item &&
      this.item.content &&
      this.item.content.includes('[^') &&
      /\[\^\d+\]:{"type":"doc","docId":"[^"]+"}/.test(this.item.content);

    return html`<div class="user-info">
      <chat-assistant-avatar .status=${this.status}></chat-assistant-avatar>
      ${isWithDocs
        ? html`<span class="message-info">with your docs</span>`
        : nothing}
    </div>`;
  }

  renderContent() {
    const { host, item, isLast, status, error } = this;
    const { streamObjects, content } = item;
    const shouldRenderError = isLast && status === 'error' && !!error;

    return html`
      ${this.renderImages()}
      ${streamObjects?.length
        ? this.renderStreamObjects(streamObjects)
        : this.renderRichText(content)}
      ${shouldRenderError ? AIChatErrorRenderer(host, error) : nothing}
      ${this.renderEditorActions()}
    `;
  }

  private renderImages() {
    const { item } = this;
    if (!item.attachments) return nothing;

    return html`<chat-content-images
      .images=${item.attachments}
    ></chat-content-images>`;
  }

  private renderStreamObjects(answer: StreamObject[]) {
    return html`<div>
      ${answer.map(data => {
        switch (data.type) {
          case 'text-delta':
            return this.renderRichText(data.textDelta);
          case 'reasoning':
            return html`
              <div class="reasoning-wrapper">
                ${this.renderRichText(data.textDelta)}
              </div>
            `;
          case 'tool-call':
            return this.renderToolCall(data);
          case 'tool-result':
            return this.renderToolResult(data);
          default:
            return nothing;
        }
      })}
    </div>`;
  }

  private renderToolCall(streamObject: StreamObject) {
    if (streamObject.type !== 'tool-call') {
      return nothing;
    }

    switch (streamObject.toolName) {
      case 'web_crawl_exa':
        return html`
          <web-crawl-tool
            .data=${streamObject}
            .host=${this.host}
          ></web-crawl-tool>
        `;
      case 'web_search_exa':
        return html`
          <web-search-tool
            .data=${streamObject}
            .host=${this.host}
          ></web-search-tool>
        `;
      default:
        return html`
          <div class="tool-wrapper">
            ${streamObject.toolName} tool calling...
          </div>
        `;
    }
  }

  private renderToolResult(streamObject: StreamObject) {
    if (streamObject.type !== 'tool-result') {
      return nothing;
    }

    switch (streamObject.toolName) {
      case 'web_crawl_exa':
        return html`
          <web-crawl-tool
            .data=${streamObject}
            .host=${this.host}
          ></web-crawl-tool>
        `;
      case 'web_search_exa':
        return html`
          <web-search-tool
            .data=${streamObject}
            .host=${this.host}
          ></web-search-tool>
        `;
      default:
        return html`
          <div class="tool-wrapper">
            ${streamObject.toolName} tool result...
          </div>
        `;
    }
  }

  private renderRichText(text: string) {
    const { host, isLast, status } = this;
    const state = isLast
      ? status !== 'loading' && status !== 'transmitting'
        ? 'finished'
        : 'generating'
      : 'finished';

    return html`<chat-content-rich-text
      .host=${host}
      .text=${text}
      .state=${state}
      .extensions=${this.extensions}
      .affineFeatureFlagService=${this.affineFeatureFlagService}
    ></chat-content-rich-text>`;
  }

  private renderEditorActions() {
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
    const { content, streamObjects, id: messageId } = item;
    const markdown = streamObjects?.length
      ? mergeStreamContent(streamObjects)
      : content;

    const actions = isInsidePageEditor(host)
      ? PageEditorActions
      : EdgelessEditorActions;

    return html`
      <chat-copy-more
        .host=${host}
        .actions=${actions}
        .content=${markdown}
        .isLast=${isLast}
        .getSessionId=${this.getSessionId}
        .messageId=${messageId}
        .withMargin=${true}
        .retry=${() => this.retry()}
      ></chat-copy-more>
      ${isLast && !!markdown
        ? html`<chat-action-list
            .actions=${actions}
            .host=${host}
            .content=${markdown}
            .getSessionId=${this.getSessionId}
            .messageId=${messageId ?? undefined}
            .withMargin=${true}
          ></chat-action-list>`
        : nothing}
    `;
  }

  protected override render() {
    const { isLast, status } = this;

    if (isLast && status === 'loading') {
      return html`<ai-loading></ai-loading>`;
    }

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
