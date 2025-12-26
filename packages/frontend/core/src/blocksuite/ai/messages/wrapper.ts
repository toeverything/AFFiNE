import type { EditorHost } from '@blocksuite/affine/std';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import { getAIPanelWidget } from '../utils/ai-widgets';
import { preprocessHtml } from '../utils/html';
import type { AffineAIPanelWidgetConfig } from '../widgets/ai-panel/type';

type AIAnswerWrapperOptions = {
  height: number;
};

export class AIAnswerWrapper extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      box-sizing: border-box;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-shadow-1);
      background: var(--affine-background-secondary-color);
      overflow: hidden;
    }

    ::slotted(.ai-answer-iframe) {
      width: 100%;
      height: 100%;
      border: none;
    }

    ::slotted(.ai-answer-image) {
      width: 100%;
      height: 100%;
    }
  `;

  @property({ attribute: false })
  accessor options: AIAnswerWrapperOptions | undefined = undefined;

  protected override render() {
    return html`<style>
        :host {
          height: ${this.options?.height
            ? this.options?.height + 'px'
            : '100%'};
        }
      </style>
      <slot></slot> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-answer-wrapper': AIAnswerWrapper;
  }
}

export const createIframeRenderer: (
  host: EditorHost,
  options?: AIAnswerWrapperOptions
) => AffineAIPanelWidgetConfig['answerRenderer'] = (host, options) => {
  return (answer, state) => {
    if (state === 'generating') {
      const panel = getAIPanelWidget(host);
      panel.generatingElement?.updateLoadingProgress(2);
      return nothing;
    }

    if (state !== 'finished' && state !== 'error') {
      return nothing;
    }

    const template = html`<iframe
      class="ai-answer-iframe"
      sandbox="allow-scripts"
      scrolling="no"
      .srcdoc=${preprocessHtml(answer)}
    >
    </iframe>`;
    return html`<ai-answer-wrapper .options=${options}
      >${template}</ai-answer-wrapper
    >`;
  };
};

export const createImageRenderer: (
  host: EditorHost,
  options?: AIAnswerWrapperOptions
) => AffineAIPanelWidgetConfig['answerRenderer'] = (host, options) => {
  return (answer, state) => {
    if (state === 'generating') {
      const panel = getAIPanelWidget(host);
      panel.generatingElement?.updateLoadingProgress(2);
      return nothing;
    }

    if (state !== 'finished' && state !== 'error') {
      return nothing;
    }

    const template = html`<style>
      .ai-answer-image img{
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    </style>
    <div class="ai-answer-image" data-testid="ai-answer-image">
      <img src=${answer}></img>
    </div>`;

    return html`<ai-answer-wrapper .options=${options}
      >${template}</ai-answer-wrapper
    >`;
  };
};
