import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { LayoutColumnBlockModel } from '@blocksuite/affine-model';
import { html } from 'lit';
import { layoutStyles } from './styles.js';

export class LayoutColumnBlockComponent extends CaptionedBlockComponent<LayoutColumnBlockModel> {
  static override styles = layoutStyles;

  override renderBlock() {
    return html`
      <div class="affine-layout-column-container">
        ${this.renderChildren(this.model)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-layout-column': LayoutColumnBlockComponent;
  }
}
