import { css, html } from 'lit';

import { EdgelessToolIconButton } from './tool-icon-button.js';

export class EdgelessToolbarButton extends EdgelessToolIconButton {
  static override styles = css`
    .icon-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: var(--affine-icon-color);
      cursor: pointer;
    }

    .icon-container.active-mode-color[active] {
      color: var(--affine-primary-color);
    }

    .icon-container.active-mode-background[active] {
      background: var(--affine-hover-color);
    }

    .icon-container[disabled] {
      pointer-events: none;
      cursor: not-allowed;
    }

    .icon-container[coming] {
      cursor: not-allowed;
      color: var(--affine-text-disable-color);
    }
  `;

  override render() {
    return html` ${super.render()} `;
  }
}
