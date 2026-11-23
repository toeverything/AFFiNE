import { createModal } from '@blocksuite/affine-components/context-menu';
import { CloseIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

export class CenterPeek extends ShadowlessElement {
  static override styles = css`
    center-peek {
      flex-direction: column;
      position: absolute;
      top: 5%;
      left: 5%;
      width: 90%;
      height: 90%;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
      border-radius: 12px;
    }

    .side-modal-content {
      flex: 1;
      overflow-y: auto;
    }

    .close-modal:hover {
      background-color: var(--affine-hover-color);
    }
    .close-modal {
      position: absolute;
      right: -32px;
      top: 0;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  `;

  override render() {
    return html`
      <div @click="${this.close}" class="close-modal">${CloseIcon()}</div>
      ${this.content}
    `;
  }

  @property({ attribute: false })
  accessor close: (() => void) | undefined = undefined;

  @property({ attribute: false })
  accessor content: TemplateResult | undefined = undefined;
}

export const popSideDetail = (template: TemplateResult) => {
  return new Promise<void>(res => {
    const modal = createModal(document.body);
    const close = () => {
      modal.remove();
      res();
    };
    const sideContainer = new CenterPeek();
    sideContainer.content = template;
    sideContainer.close = close;
    modal.onclick = e => e.target === modal && close();
    modal.append(sideContainer);
  });
};
