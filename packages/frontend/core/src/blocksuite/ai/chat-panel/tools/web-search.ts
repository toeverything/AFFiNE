import { WithDisposable } from '@blocksuite/affine/global/lit';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { WebIcon } from '@blocksuite/icons/lit';
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
        icon: favicon,
        content: content,
      };
    });

    return html`
      <tool-result-card
        .host=${this.host}
        .name=${'The search is complete, and these webpages have been searched'}
        .icon=${WebIcon()}
        .results=${results}
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
