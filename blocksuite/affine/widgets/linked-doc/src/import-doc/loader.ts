import { BLOCK_ID_ATTR } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class Loader extends LitElement {
  static override styles = css`
    .load-container {
      margin: 10px auto;
      width: var(--loader-width);
      text-align: center;
    }

    .load-container .load {
      width: 8px;
      height: 8px;
      background-color: var(--affine-text-primary-color);

      border-radius: 100%;
      display: inline-block;
      -webkit-animation: bouncedelay 1.4s infinite ease-in-out;
      animation: bouncedelay 1.4s infinite ease-in-out;
      /* Prevent first note from flickering when animation starts */
      -webkit-animation-fill-mode: both;
      animation-fill-mode: both;
    }
    .load-container .load1 {
      -webkit-animation-delay: -0.32s;
      animation-delay: -0.32s;
    }
    .load-container .load2 {
      -webkit-animation-delay: -0.16s;
      animation-delay: -0.16s;
    }

    @-webkit-keyframes bouncedelay {
      0%,
      80%,
      100% {
        -webkit-transform: scale(0.625);
      }
      40% {
        -webkit-transform: scale(1);
      }
    }

    @keyframes bouncedelay {
      0%,
      80%,
      100% {
        transform: scale(0);
        -webkit-transform: scale(0.625);
      }
      40% {
        transform: scale(1);
        -webkit-transform: scale(1);
      }
    }
  `;

  constructor() {
    super();
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.hostModel) {
      this.setAttribute(BLOCK_ID_ATTR, this.hostModel.id);
      this.dataset.serviceLoading = 'true';
    }

    const width = this.width;
    this.style.setProperty(
      '--loader-width',
      typeof width === 'string' ? width : `${width}px`
    );
  }

  override render() {
    return html`
      <div class="load-container">
        <div class="load load1"></div>
        <div class="load load2"></div>
        <div class="load"></div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor hostModel: BlockModel | null = null;

  @property({ attribute: false })
  accessor radius: string | number = '8px';

  @property({ attribute: false })
  accessor width: string | number = '150px';
}

declare global {
  interface HTMLElementTagNameMap {
    'loader-element': Loader;
  }
}
