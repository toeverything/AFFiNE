import type { RootBlockModel } from '@blocksuite/affine-model';
import { WidgetComponent } from '@blocksuite/block-std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, nothing, unsafeCSS } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import type { EdgelessRootBlockComponent } from '../../edgeless-root-block.js';
import { DefaultTool } from '../../gfx-tool/default-tool.js';
import { DefaultModeDragType } from '../../gfx-tool/default-tool-ext/ext.js';

export const EDGELESS_DRAGGING_AREA_WIDGET = 'edgeless-dragging-area-rect';

export class EdgelessDraggingAreaRectWidget extends WidgetComponent<
  RootBlockModel,
  EdgelessRootBlockComponent
> {
  static override styles = css`
    .affine-edgeless-dragging-area {
      position: absolute;
      background: ${unsafeCSS(
        cssVarV2('edgeless/selection/selectionMarqueeBackground', '#1E96EB14')
      )};
      box-sizing: border-box;
      border-width: 1px;
      border-style: solid;
      border-color: ${unsafeCSS(
        cssVarV2('edgeless/selection/selectionMarqueeBorder', '#1E96EB')
      )};

      z-index: 1;
      pointer-events: none;
    }
  `;

  override render() {
    if (!this.block) {
      return nothing;
    }
    const rect = this.block.gfx.tool.draggingViewArea$.value;
    const tool = this.block.gfx.tool.currentTool$.value;

    if (
      rect.w === 0 ||
      rect.h === 0 ||
      !(tool instanceof DefaultTool) ||
      tool.dragType !== DefaultModeDragType.Selecting
    )
      return nothing;

    const style = {
      left: rect.x + 'px',
      top: rect.y + 'px',
      width: rect.w + 'px',
      height: rect.h + 'px',
    };

    return html`
      <div class="affine-edgeless-dragging-area" style=${styleMap(style)}></div>
    `;
  }
}
