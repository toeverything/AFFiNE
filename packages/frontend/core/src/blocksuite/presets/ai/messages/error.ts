import { type EditorHost, WithDisposable } from '@blocksuite/block-std';
import {
  type AIError,
  PaymentRequiredError,
  UnauthorizedError,
} from '@blocksuite/blocks';
import { html, LitElement, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ErrorTipIcon } from '../_common/icons';
import { AIProvider } from '../provider';

export class AIErrorWrapper extends WithDisposable(LitElement) {
  @property({ attribute: false })
  accessor text!: TemplateResult<1>;

  protected override render() {
    return html` <style>
        .answer-tip {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 4px;
          align-self: stretch;
          border-radius: 4px;
          padding: 8px;
          background-color: var(--affine-background-error-color);

          .bottom {
            align-items: flex-start;
            display: flex;
            gap: 8px;
            align-self: stretch;
            color: var(--affine-error-color, #eb4335);
            font-feature-settings:
              'clig' off,
              'liga' off;
            /* light/sm */
            font-size: var(--affine-font-sm);
            font-style: normal;
            font-weight: 400;
            line-height: 22px; /* 157.143% */
            margin-bottom: 4px;

            a {
              color: inherit;
            }

            div svg {
              position: relative;
              top: 3px;
            }
          }
        }
      </style>
      <div class="answer-tip">
        <div class="bottom">
          <div>${ErrorTipIcon}</div>
          <div>${this.text}</div>
        </div>
        <slot></slot>
      </div>`;
  }
}

export const PaymentRequiredErrorRenderer = (host: EditorHost) => html`
  <style>
    .upgrade {
      cursor: pointer;
      display: flex;
      padding: 4px 12px;
      justify-content: center;
      align-items: center;
      gap: 4px;
      border-radius: 8px;
      margin-left: auto;
      border: 1px solid var(--affine-border-color, #e3e2e4);
      background: var(--affine-primary-color);
      .content {
        display: flex;
        padding: 0px 4px;
        justify-content: center;
        align-items: center;
        color: var(--affine-pure-white);
        /* light/xsMedium */
        font-size: var(--affine-font-xs);
        font-style: normal;
        font-weight: 500;
        line-height: 20px; /* 166.667% */
      }
    }
  </style>
  <ai-error-wrapper
    .text=${html`You've reached the current usage cap for AFFiNE AI. You can
    subscribe to AFFiNE AI to continue the AI experience!`}
  >
    <div
      @click=${() => AIProvider.slots.requestUpgradePlan.emit({ host: host })}
      class="upgrade"
    >
      <div class="content">Upgrade</div>
    </div></ai-error-wrapper
  >
`;

type ErrorProps = {
  text?: TemplateResult<1>;
  template?: TemplateResult<1>;
  error?: TemplateResult<1>;
};

const generateText = (error?: TemplateResult<1>) =>
  html`${error || 'An error occurred'}, If this issue persists please let us
    know.<a href="mailto:support@toeverything.info">
      support@toeverything.info
    </a>`;

const nope = html`${nothing}`;
const GeneralErrorRenderer = (props: ErrorProps = {}) => {
  const { text = generateText(props.error), template = nope } = props;
  return html`<ai-error-wrapper .text=${text}>${template}</ai-error-wrapper>`;
};

declare global {
  interface HTMLElementTagNameMap {
    'ai-error-wrapper': AIErrorWrapper;
  }
}

export function AIChatErrorRenderer(host: EditorHost, error: AIError) {
  if (error instanceof PaymentRequiredError) {
    return PaymentRequiredErrorRenderer(host);
  } else if (error instanceof UnauthorizedError) {
    return GeneralErrorRenderer({
      text: html`You need to login to AFFiNE Cloud to continue using AFFiNE AI.`,
      template: html`<div
        style=${styleMap({
          padding: '4px 12px',
          borderRadius: '8px',
          border: '1px solid var(--affine-border-color)',
          cursor: 'pointer',
          backgroundColor: 'var(--affine-hover-color)',
        })}
        @click=${() => AIProvider.slots.requestLogin.emit({ host })}
      >
        Login
      </div>`,
    });
  } else {
    const tip = error.message;
    return GeneralErrorRenderer({
      error: html` <style>
          .tip {
            text-decoration: underline;
          }
        </style>
        <span class="tip"
          >An error occurred<affine-tooltip
            tip-position="bottom-start"
            .arrow=${false}
            >${tip}</affine-tooltip
          ></span
        >`,
    });
  }
}
