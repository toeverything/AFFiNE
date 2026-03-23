import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine-block-surface';
import {
  AllShapeConfig,
  mountShapeTextEditor,
} from '@blocksuite/affine-gfx-shape';
import {
  ConnectorMode,
  getShapeRadius,
  getShapeType,
  type ShapeElementModel,
  type ShapeName,
} from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { clamp } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import type { BlockComponent } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  createEdgelessElement,
  Direction,
  getPosition,
  getShapeMenuLayout,
  nextBound,
  SHAPE_MENU_ITEM_GAP,
  SHAPE_MENU_ITEM_HEIGHT,
  SHAPE_MENU_ITEM_WIDTH,
  SHAPE_MENU_PANEL_PADDING,
} from './utils.js';

const FLOWCHART_SHAPES = AllShapeConfig.filter(item =>
  String(item.name).startsWith('flowchart')
);

const PANEL_MARGIN = 12;

export class EdgelessFlowchartShapePanel extends WithDisposable(LitElement) {
  static override styles = css`
    .flowchart-panel {
      position: absolute;
      display: grid;
      gap: ${SHAPE_MENU_ITEM_GAP}px;
      padding: ${SHAPE_MENU_PANEL_PADDING}px;
      justify-content: center;
      border-radius: 10px;
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-shadow-2);
      box-sizing: border-box;
      z-index: 1;
      overflow: auto;
      overscroll-behavior: contain;
    }

    .flowchart-item {
      width: ${SHAPE_MENU_ITEM_WIDTH}px;
      height: ${SHAPE_MENU_ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      cursor: pointer;
    }

    .flowchart-item:hover {
      background: var(--affine-hover-color);
    }

    .flowchart-item svg {
      width: 20px;
      height: 20px;
      transform: scale(0.85);
    }
  `;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor current!: ShapeElementModel;

  @property({ attribute: false })
  accessor direction!: Direction;

  get gfx() {
    return this.edgeless.std.get(GfxControllerIdentifier);
  }

  get crud() {
    return this.edgeless.std.get(EdgelessCRUDIdentifier);
  }

  private _getConnectedElements() {
    const surface = getSurfaceBlock(this.edgeless.std.store);
    if (!surface) return [];

    return surface.getConnectors(this.current.id).reduce((prev, current) => {
      if (current.target.id === this.current.id && current.source.id) {
        prev.push(
          this.crud.getElementById(current.source.id) as ShapeElementModel
        );
      }
      if (current.source.id === this.current.id && current.target.id) {
        prev.push(
          this.crud.getElementById(current.target.id) as ShapeElementModel
        );
      }
      return prev;
    }, [] as ShapeElementModel[]);
  }

  private _computeNextBound() {
    const connected = this._getConnectedElements();
    const bound = nextBound(this.direction, this.current, connected);
    const currentBound = this.current.elementBound;

    switch (this.direction) {
      case Direction.Top:
      case Direction.Bottom:
        bound.x = currentBound.x + (currentBound.w - bound.w) / 2;
        break;
      case Direction.Left:
      case Direction.Right:
        bound.y = currentBound.y + (currentBound.h - bound.h) / 2;
        break;
    }

    return bound;
  }

  private _addConnector(sourceId: string, targetId: string) {
    const { startPosition, endPosition } = getPosition(this.direction);
    const connectorMode =
      this.edgeless.std.get(EditPropsStore).lastProps$.value.connector.mode ??
      ConnectorMode.Rounded;

    this.crud.addElement(CanvasElementType.CONNECTOR, {
      mode: connectorMode,
      source: {
        id: sourceId,
        position: startPosition,
      },
      target: {
        id: targetId,
        position: endPosition,
      },
    });
  }

  private _addShape(targetType: ShapeName) {
    const bound = this._computeNextBound();
    const id = createEdgelessElement(this.edgeless, this.current, bound);
    if (!id) return;

    this.crud.updateElement(id, {
      xywh: bound.serialize(),
      shapeType: getShapeType(targetType),
      radius: getShapeRadius(targetType),
    });
    this._addConnector(this.current.id, id);

    mountShapeTextEditor(
      this.crud.getElementById(id) as ShapeElementModel,
      this.edgeless
    );
    this.gfx.selection.set({
      elements: [id],
      editing: true,
    });
    this.edgeless.store.captureSync();
    this.remove();
  }

  private _getPanelPosition() {
    const { viewport } = this.gfx;
    const { boundingClientRect } = viewport;
    const layout = getShapeMenuLayout(
      FLOWCHART_SHAPES.length,
      boundingClientRect.width
    );
    const bound = this.current.elementBound;
    const [left, top] = viewport.toViewCoord(bound.x, bound.y);
    const [right, bottom] = viewport.toViewCoord(
      bound.x + bound.w,
      bound.y + bound.h
    );

    const width = right - left;
    const height = bottom - top;

    let x = left + width / 2 - layout.width / 2;
    let y = top - layout.height - PANEL_MARGIN;

    switch (this.direction) {
      case Direction.Right:
        x = right + PANEL_MARGIN;
        y = top + height / 2 - layout.height / 2;
        break;
      case Direction.Bottom:
        x = left + width / 2 - layout.width / 2;
        y = bottom + PANEL_MARGIN;
        break;
      case Direction.Left:
        x = left - PANEL_MARGIN - layout.width;
        y = top + height / 2 - layout.height / 2;
        break;
      case Direction.Top:
        x = left + width / 2 - layout.width / 2;
        y = top - layout.height - PANEL_MARGIN;
        break;
    }

    x = clamp(x, 20, boundingClientRect.width - 20 - layout.width);
    y = clamp(y, 20, boundingClientRect.height - 20 - layout.height);

    return [x, y, layout] as const;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.edgeless.handleEvent('click', ctx => {
      const raw = ctx.get('pointerState').raw as MouseEvent | PointerEvent;
      const composedPath = raw.composedPath?.() ?? [];
      const clickAway = !composedPath.includes(this);
      if (clickAway) this.remove();
    });
  }

  override firstUpdated() {
    this.disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(() => this.requestUpdate())
    );
  }

  override render() {
    const position = this._getPanelPosition();
    if (!position) return nothing;
    const [x, y, layout] = position;

    return html`<div
      class="flowchart-panel"
      style=${styleMap({
        left: `${x}px`,
        top: `${y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        gridTemplateColumns: `repeat(${layout.columns}, ${SHAPE_MENU_ITEM_WIDTH}px)`,
      })}
      @wheel=${stopPropagation}
      @pointerdown=${stopPropagation}
    >
      ${repeat(
        FLOWCHART_SHAPES,
        item => item.name,
        item =>
          html`<div
            class="flowchart-item"
            @click=${() => this._addShape(item.name as ShapeName)}
          >
            ${item.generalIcon}
          </div>`
      )}
    </div>`;
  }
}
