import { WithDisposable } from '@blocksuite/global/lit';
import { PageIcon, SearchIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { ToolResult } from './tool-result-card';

interface DocKeywordSearchToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: { query: string };
}

interface DocKeywordSearchToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: { query: string };
  result: Array<{
    title: string;
    docId: string;
  }>;
}

export class DocKeywordSearchResult extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .doc-keyword-search-result-title {
      cursor: pointer;
    }
  `;

  @property({ attribute: false })
  accessor data!: DocKeywordSearchToolCall | DocKeywordSearchToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId?: string) => void;

  renderToolCall() {
    return html`<tool-call-card
      .name=${`Searching workspace documents for "${this.data.args.query}"`}
      .icon=${SearchIcon()}
      .width=${this.width}
    ></tool-call-card>`;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }
    let results: ToolResult[] = [];
    try {
      results = this.data.result.map(item => ({
        title: html`<span
          class="doc-keyword-search-result-title"
          @click=${() => this.onOpenDoc(item.docId)}
        >
          ${item.title}
        </span>`,
        icon: PageIcon(),
      }));
    } catch (err) {
      console.error('Failed to parse result', err);
    }
    return html`<tool-result-card
      .name=${`Found ${this.data.result.length} pages for "${this.data.args.query}"`}
      .icon=${SearchIcon()}
      .width=${this.width}
      .results=${results}
    ></tool-result-card>`;
  }

  protected override render() {
    if (this.data.type === 'tool-call') {
      return this.renderToolCall();
    }
    return this.renderToolResult();
  }
}
