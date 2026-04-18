import type { ColumnBlockModel } from '@blocksuite/affine-model';
import { BlockComponent } from '@blocksuite/std';
import { css, html } from 'lit';

export class ColumnBlockComponent extends BlockComponent<ColumnBlockModel> {
  static override styles = css`
    :host {
      display: block;
      min-width: 0;
    }
  `;

  override renderBlock() {
    this.style.flex = `${this.model.props.width} 1 0`;

    return html`
      <div class="affine-block-children-container">
        ${this.renderChildren(this.model)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-column': ColumnBlockComponent;
  }
}
