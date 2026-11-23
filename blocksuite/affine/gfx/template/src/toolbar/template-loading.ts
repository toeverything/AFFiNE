import { css, html, LitElement } from 'lit';

export class AffineTemplateLoading extends LitElement {
  static override styles = css`
    @keyframes affine-template-block-rotate {
      from {
        rotate: 0deg;
      }
      to {
        rotate: 360deg;
      }
    }

    .affine-template-block-container {
      width: 20px;
      height: 20px;
      overflow: hidden;
    }

    .affine-template-block-loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      position: relative;
      background: conic-gradient(
        rgba(30, 150, 235, 1) 90deg,
        rgba(0, 0, 0, 0.1) 90deg 360deg
      );
      border-radius: 50%;
      animation: affine-template-block-rotate 1s infinite ease-in;
    }

    .affine-template-block-loading::before {
      content: '';
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: white;
      position: absolute;
      top: 3px;
      left: 3px;
    }
  `;

  override render() {
    return html`<div class="affine-template-block-container">
      <div class="affine-template-block-loading"></div>
    </div>`;
  }
}
