import { ShadowlessElement } from '@blocksuite/affine/std';
import { css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('left-side-panel')
export class LeftSidePanel extends ShadowlessElement {
  static override styles = css`
    left-side-panel {
      padding-top: 50px;
      width: 300px;
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      display: none;
    }
  `;

  currentContent: HTMLElement | null = null;

  hideContent() {
    if (this.currentContent) {
      this.style.display = 'none';
      this.currentContent.remove();
      this.currentContent = null;
    }
  }

  protected override render(): unknown {
    return html``;
  }

  showContent(ele: HTMLElement) {
    if (this.currentContent) {
      this.currentContent.remove();
    }
    this.style.display = 'block';
    this.currentContent = ele;
    this.append(ele);
  }

  toggle(ele: HTMLElement) {
    if (this.currentContent !== ele) {
      this.showContent(ele);
    } else {
      this.hideContent();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'left-side-panel': LeftSidePanel;
  }
}
