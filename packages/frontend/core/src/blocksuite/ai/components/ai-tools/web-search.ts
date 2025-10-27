import { WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { WebIcon } from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { ToolError } from './type';

interface WebSearchToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: { query: string };
}

interface WebSearchToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: { query: string };
  result:
    | Array<{
        title: string;
        url: string;
        content: string;
        favicon: string;
        publishedDate: string;
        author: string;
      }>
    | ToolError
    | null;
}

export class WebSearchTool extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor data!: WebSearchToolCall | WebSearchToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  renderToolCall() {
    return html`
      <tool-call-card
        .name=${`Searching the web for "${this.data.args.query}"`}
        .icon=${WebIcon()}
      ></tool-call-card>
    `;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const result = this.data.result;
    if (result && Array.isArray(result)) {
      const results = result.map(item => {
        const { favicon, title, content, url } = item;
        return {
          title: title,
          icon: favicon || WebIcon(),
          content: content,
          href: url,
        };
      });
      const footerIcons = result.map(item => item.favicon).filter(Boolean);

      return html`
        <tool-result-card
          .name=${'The search is complete, and these webpages have been searched'}
          .icon=${WebIcon()}
          .footerIcons=${footerIcons}
          .results=${results}
          .width=${this.width}
        ></tool-result-card>
      `;
    }

    return html`
      <tool-call-failed
        .name=${'Web search failed'}
        .icon=${WebIcon()}
      ></tool-call-failed>
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
