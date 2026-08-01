import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { LayoutRowBlockModel } from '@blocksuite/affine-model';
import { html } from 'lit';
import { layoutStyles } from './styles.js';

export class LayoutRowBlockComponent extends CaptionedBlockComponent<LayoutRowBlockModel> {
  static override styles = layoutStyles;

  override renderBlock() {
    return html`
      <div class="affine-layout-row-container">
        ${this.renderChildren(this.model)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-layout-row': LayoutRowBlockComponent;
  }
}
