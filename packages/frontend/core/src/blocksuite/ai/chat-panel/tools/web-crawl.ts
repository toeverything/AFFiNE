import { WithDisposable } from '@blocksuite/affine/global/lit';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { WebIcon } from '@blocksuite/icons/lit';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

interface WebCrawlToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: { url: string };
}

interface WebCrawlToolResult {
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

export class WebCrawlTool extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor data!: WebCrawlToolCall | WebCrawlToolResult;

  @property({ attribute: false })
  accessor host!: EditorHost;

  renderToolCall() {
    return html`
      <tool-call-card
        .name=${'Reading the website'}
        .icon=${WebIcon()}
      ></tool-call-card>
    `;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const { favicon, title, content } = this.data.result[0];

    return html`
      <tool-result-card
        .host=${this.host}
        .name=${'Reading the website'}
        .icon=${WebIcon()}
        .results=${[
          {
            title: title,
            icon: favicon,
            content: content,
          },
        ]}
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
