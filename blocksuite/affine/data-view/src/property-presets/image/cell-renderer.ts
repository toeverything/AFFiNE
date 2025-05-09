import { css, html } from 'lit';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import { imagePropertyModelConfig } from './define.js';

export class ImageCell extends BaseCellRenderer<string, string> {
  static override styles = css`
    affine-database-image-cell {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
    }
    affine-database-image-cell img {
      width: 20px;
      height: 20px;
    }
  `;

  override render() {
    return html`<img src=${this.value ?? ''}></img>`;
  }
}

export const imagePropertyConfig = imagePropertyModelConfig.createPropertyMeta({
  icon: createIcon('ImageIcon'),
  cellRenderer: {
    view: createFromBaseCellRenderer(ImageCell),
  },
});
