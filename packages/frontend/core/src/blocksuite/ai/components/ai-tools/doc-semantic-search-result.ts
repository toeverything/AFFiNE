import type { PeekViewService } from '@affine/core/modules/peek-view';
import { WithDisposable } from '@blocksuite/global/lit';
import { AiEmbeddingIcon, PageIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { DocDisplayConfig } from '../ai-chat-chips';

interface DocSemanticSearchToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: { query: string };
}

interface DocSemanticSearchToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: { query: string };
  result: Array<{
    content: string;
    docId: string;
  }>;
}

function parseResultContent(content: string) {
  const properties = [
    'Title',
    'Created at',
    'Updated at',
    'Created by',
    'Updated by',
  ];
  try {
    // A row starts with "Title: ${title}\n"
    const title = content.match(/^Title:\s+(.*)\n/)?.[1];
    // from first row that not starts with "${propertyName}:" to end of the content
    const rows = content.split('\n');
    const startIndex = rows.findIndex(
      line => !properties.some(property => line.startsWith(`${property}:`))
    );
    const text = rows.slice(startIndex).join('\n');
    return {
      title,
      content: text,
      icon: PageIcon(),
    };
  } catch (error) {
    console.error('Failed to parse result content', error);
    return null;
  }
}

export class DocSemanticSearchResult extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor data!: DocSemanticSearchToolCall | DocSemanticSearchToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor docDisplayService!: DocDisplayConfig;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId?: string) => void;

  @property({ attribute: false })
  accessor peekViewService!: PeekViewService;

  renderToolCall() {
    return html`<tool-call-card
      .name=${`Finding semantically related pages for "${this.data.args.query}"`}
      .icon=${AiEmbeddingIcon()}
      .width=${this.width}
    ></tool-call-card>`;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }
    return html`<tool-result-card
      .name=${`Found semantically related pages for "${this.data.args.query}"`}
      .icon=${AiEmbeddingIcon()}
      .width=${this.width}
      .results=${this.data.result
        .map(result => ({
          ...parseResultContent(result.content),
          title: this.docDisplayService.getTitle(result.docId),
          onClick: () => {
            this.peekViewService.peekView
              .open({
                type: 'doc',
                docRef: {
                  docId: result.docId,
                },
              })
              .catch(console.error);
          },
        }))
        .filter(Boolean)}
    ></tool-result-card>`;
  }

  protected override render() {
    const { data } = this;

    if (data.type === 'tool-call') {
      return this.renderToolCall();
    }
    if (data.type === 'tool-result') {
      return this.renderToolResult();
    }
    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'doc-semantic-search-result': DocSemanticSearchResult;
  }
}
