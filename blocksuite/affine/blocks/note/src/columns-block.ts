import type { ColumnsBlockModel } from '@blocksuite/affine-model';
import { BlockComponent } from '@blocksuite/std';
import { css, html } from 'lit';

export class ColumnsBlockComponent extends BlockComponent<ColumnsBlockModel> {
  static override styles = css`
    :host {
      display: block;
      margin: 12px 0;
    }

    .affine-columns-block-container {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
  `;

  override renderBlock() {
    this.style.display = 'block';
    return html`
      <div class="affine-columns-block-container">
        ${this.renderChildren(this.model)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-columns': ColumnsBlockComponent;
  }
}
