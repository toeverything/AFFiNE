import {
  DefaultModeDragType,
  DefaultTool,
} from '@blocksuite/affine-block-surface';
import type { RootBlockModel } from '@blocksuite/affine-model';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, nothing, unsafeCSS } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

export const EDGELESS_DRAGGING_AREA_WIDGET = 'edgeless-dragging-area-rect';

export class EdgelessDraggingAreaRectWidget extends WidgetComponent<RootBlockModel> {
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

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  override render() {
    const rect = this.gfx.tool.draggingViewportArea$.value;
    const tool = this.gfx.tool.currentTool$.value;

    if (
      rect.w === 0 ||
      rect.h === 0 ||
      !tool ||
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

export const edgelessDraggingAreaWidget = WidgetViewExtension(
  'affine:page',
  EDGELESS_DRAGGING_AREA_WIDGET,
  literal`${unsafeStatic(EDGELESS_DRAGGING_AREA_WIDGET)}`
);
