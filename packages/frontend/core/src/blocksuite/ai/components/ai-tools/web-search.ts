import { WithDisposable } from '@blocksuite/affine/global/lit';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { WebIcon } from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

interface WebSearchToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: { url: string };
}

interface WebSearchToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: { url: string };
  result: Array<{
    title: string;
    url: string;
    content: string;
    favicon: string;
    publishedDate: string;
    author: string;
  }>;
}

export class WebSearchTool extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor data!: WebSearchToolCall | WebSearchToolResult;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  renderToolCall() {
    return html`
      <tool-call-card
        .name=${'Search from web'}
        .icon=${WebIcon()}
      ></tool-call-card>
    `;
  }
  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const results = this.data.result.map(item => {
      const { favicon, title, content } = item;
      return {
        title: title,
        icon: favicon || WebIcon(),
        content: content,
      };
    });
    const footerIcons = this.data.result
      .map(item => item.favicon)
      .filter(Boolean);

    return html`
      <tool-result-card
        .host=${this.host}
        .name=${'The search is complete, and these webpages have been searched'}
        .icon=${WebIcon()}
        .footerIcons=${footerIcons}
        .results=${results}
        .width=${this.width}
      ></tool-result-card>
    `;
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
