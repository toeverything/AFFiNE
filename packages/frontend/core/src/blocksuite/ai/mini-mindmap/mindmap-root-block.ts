import type { RootBlockModel } from '@blocksuite/affine/model';
import { BlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';

export class MindmapRootBlock extends BlockComponent<RootBlockModel> {
  override render() {
    return html`
      <style>
        .affine-mini-mindmap-root {
          display: block;
          width: 100%;
          height: 100%;

          background-size: 20px 20px;
          background-color: var(--affine-background-primary-color);
          background-image: radial-gradient(
            var(--affine-edgeless-grid-color) 1px,
            var(--affine-background-primary-color) 1px
          );
        }
      </style>
      <div class="affine-mini-mindmap-root">
        ${this.host.renderChildren(this.model)}
      </div>
    `;
  }
}
