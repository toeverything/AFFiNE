import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { Bound } from '@blocksuite/global/gfx';
import { toGfxBlockComponent } from '@blocksuite/std';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { EmbedIframeBlockComponent } from './embed-iframe-block';

export class EmbedEdgelessIframeBlockComponent extends toGfxBlockComponent(
  EmbedIframeBlockComponent
) {
  override selectedStyle$ = null;

  override blockDraggable = false;

  override accessor blockContainerStyles = {
    margin: '0',
    backgroundColor: 'transparent',
  };

  get edgelessSlots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  override connectedCallback() {
    super.connectedCallback();

    this.edgelessSlots.elementResizeStart.subscribe(() => {
      this.isResizing$.value = true;
    });

    this.edgelessSlots.elementResizeEnd.subscribe(() => {
      this.isResizing$.value = false;
    });
  }

  override renderGfxBlock() {
    const bound = Bound.deserialize(this.model.props.xywh$.value);
    const scale = this.model.props.scale$.value;
    const width = bound.w / scale;
    const height = bound.h / scale;
    const style = {
      width: `${width}px`,
      height: `${height}px`,
      transformOrigin: '0 0',
      transform: `scale(${scale})`,
    };

    return html`
      <div class="edgeless-embed-iframe-block" style=${styleMap(style)}>
        ${this.renderPageContent()}
      </div>
    `;
  }
}
