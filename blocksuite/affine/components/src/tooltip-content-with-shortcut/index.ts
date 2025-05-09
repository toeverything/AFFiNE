import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit-html/directives/repeat.js';

export class TooltipContentWithShortcut extends LitElement {
  static override styles = css`
    .tooltip-with-shortcut {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 10px;
    }
    .tooltip__shortcuts {
      display: flex;
      gap: 2px;
    }
    .tooltip__shortcut {
      font-size: 12px;
      position: relative;

      display: flex;
      align-items: center;
      justify-content: center;
      height: 16px;
      min-width: 16px;
    }
    .tooltip__shortcut::before {
      content: '';
      border-radius: 4px;
      position: absolute;
      inset: 0;
      background: currentColor;
      opacity: 0.2;
    }
    .tooltip__label {
      display: flex;
      flex: 1;
      white-space: pre;
    }
  `;

  get shortcuts() {
    let shortcut = this.shortcut;
    if (!shortcut) return [];
    return shortcut.split(' ');
  }

  override render() {
    const { tip, shortcuts, postfix } = this;

    return html`
      <div class="tooltip-with-shortcut">
        <span class="tooltip__label">${tip}</span>
        <div class="tooltip__shortcuts">
          ${repeat(
            shortcuts,
            shortcut => html`<span class="tooltip__shortcut">${shortcut}</span>`
          )}
        </div>
        ${postfix ? html`<span class="tooltip__postfix">${postfix}</span>` : ''}
      </div>
    `;
  }

  @property({ attribute: 'data-tip' })
  accessor tip!: string;

  @property({ attribute: 'data-shortcut' })
  accessor shortcut: string | undefined = undefined;

  @property({ attribute: 'data-postfix' })
  accessor postfix: string | undefined = undefined;
}

export function effects() {
  customElements.define(
    'affine-tooltip-content-with-shortcut',
    TooltipContentWithShortcut
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-tooltip-content-with-shortcut': TooltipContentWithShortcut;
  }
}
