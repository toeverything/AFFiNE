import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

import type { AIPanelAnswerConfig, CopyConfig } from '../../type.js';
import { filterAIItemGroup } from '../../utils.js';

export class AIPanelAnswer extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      width: 100%;
      display: flex;
      box-sizing: border-box;
      flex-direction: column;
      gap: 8px;
      padding: 0;
    }

    .answer {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      gap: 4px;
      align-self: stretch;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      padding: 0 12px;
    }

    .answer-head {
      align-self: stretch;

      color: var(--affine-text-secondary-color);

      /* light/xsMedium */
      font-size: var(--affine-font-xs);
      font-style: normal;
      font-weight: 500;
      line-height: 20px; /* 166.667% */
      height: 20px;
    }

    .answer-body {
      align-self: stretch;

      color: var(--affine-text-primary-color);
      font-feature-settings:
        'clig' off,
        'liga' off;

      /* light/sm */
      font-size: var(--affine-font-xs);
      font-style: normal;
      font-weight: 400;
      line-height: 22px; /* 157.143% */
    }

    .response-list-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .response-list-container,
    .action-list-container {
      padding: 0 8px;
      user-select: none;
    }

    /* set item style outside ai-item */
    .response-list-container ai-item-list,
    .action-list-container ai-item-list {
      --item-padding: 4px;
    }

    .response-list-container ai-item-list {
      --item-icon-color: var(--affine-icon-secondary);
      --item-icon-hover-color: var(--affine-icon-color);
    }
  `;

  override render() {
    const responseGroup = filterAIItemGroup(this.host, this.config.responses);
    return html`
      <div class="answer">
        <div class="answer-head">Answer</div>
        <div class="answer-body" data-testid="answer-content">
          <slot></slot>
        </div>
      </div>
      ${this.finish
        ? html`
            <ai-finish-tip
              .copy=${this.copy}
              .host=${this.host}
            ></ai-finish-tip>
            ${responseGroup.length > 0
              ? html`
                  <ai-panel-divider></ai-panel-divider>
                  ${responseGroup.map(
                    (group, index) => html`
                      ${index !== 0
                        ? html`<ai-panel-divider></ai-panel-divider>`
                        : nothing}
                      <div
                        class="response-list-container"
                        data-testid=${group.testId}
                      >
                        <ai-item-list
                          .host=${this.host}
                          .groups=${[group]}
                        ></ai-item-list>
                      </div>
                    `
                  )}
                `
              : nothing}
            ${responseGroup.length > 0 && this.config.actions.length > 0
              ? html`<ai-panel-divider></ai-panel-divider>`
              : nothing}
            ${this.config.actions.length > 0
              ? html`
                  <div class="action-list-container">
                    <ai-item-list
                      .host=${this.host}
                      .groups=${this.config.actions}
                    ></ai-item-list>
                  </div>
                `
              : nothing}
          `
        : nothing}
    `;
  }

  @property({ attribute: false })
  accessor config!: AIPanelAnswerConfig;

  @property({ attribute: false })
  accessor copy: CopyConfig | undefined = undefined;

  @property({ attribute: false })
  accessor finish = true;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'ai-penel-answer';
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-panel-answer': AIPanelAnswer;
  }
}
