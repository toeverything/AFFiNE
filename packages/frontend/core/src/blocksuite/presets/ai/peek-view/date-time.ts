import { i18nTime } from '@affine/i18n';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class DateTime extends LitElement {
  static override styles = css`
    :host {
      width: 100%;
    }
    .date-time-container {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .line {
      flex-grow: 1;
      height: 0.5px;
      background-color: var(--affine-border-color);
    }
    .date-time {
      padding: 0 8px;
      font-size: var(--affine-font-xs);
      font-weight: 400;
      line-height: 22px;
      text-align: center;
      color: var(--affine-text-secondary-color);
    }
  `;

  override render() {
    const date = i18nTime(this.date, {
      relative: {
        max: [1, 'day'],
        accuracy: 'minute',
        weekday: true,
      },
      absolute: {
        accuracy: 'second',
      },
    });

    return html`<div class="date-time-container">
      <div class="line"></div>
      <div class="date-time">${date}</div>
      <div class="line"></div>
    </div>`;
  }

  @property({ attribute: false })
  accessor date!: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'date-time': DateTime;
  }
}
