import {
  CanvasElementType,
  DefaultTool,
  EdgelessCRUDIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  getShapeRadius,
  getShapeType,
  ShapeType,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  TelemetryProvider,
  ThemeProvider,
  ViewportElementProvider,
} from '@blocksuite/affine-shared/services';
import {
  EdgelessDraggableElementController,
  EdgelessToolbarToolMixin,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ShapeTool } from '../shape-tool.js';
import { ellipseSvg, roundedSvg, triangleSvg } from '../toolbar/icons.js';
import type { DraggableShape } from './utils.js';
import { buildVariablesObject } from './utils.js';

const shapes: DraggableShape[] = [];
// to move shapes together
const oy = -2;
const ox = 0;
shapes.push({
  name: 'roundedRect',
  svg: roundedSvg,
  style: {
    default: { x: -9, y: 6 },
    hover: { y: -5, z: 1 },
    next: { y: 60 },
  },
});
shapes.push({
  name: ShapeType.Ellipse,
  svg: ellipseSvg,
  style: {
    default: { x: -20, y: 31 },
    hover: { y: 15, z: 1 },
    next: { y: 64 },
  },
});
shapes.push({
  name: ShapeType.Triangle,
  svg: triangleSvg,
  style: {
    default: { x: 18, y: 25 },
    hover: { y: 7, z: 1 },
    next: { y: 64 },
  },
});
shapes.forEach(s => {
  Object.values(s.style).forEach(style => {
    if (style.y) (style.y as number) += oy;
    if (style.x) (style.x as number) += ox;
  });
});

export class EdgelessToolbarShapeDraggable extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    :host {
      display: flex;
      justify-content: center;
      align-items: flex-end;
    }
    .edgeless-shape-draggable {
      /* avoid shadow clipping */
      --shadow-safe-area: 10px;
      box-sizing: border-box;
      flex-shrink: 0;
      width: calc(100% + 2 * var(--shadow-safe-area));
      height: calc(100% + var(--shadow-safe-area));
      padding-top: var(--shadow-safe-area);
      padding-left: var(--shadow-safe-area);
      padding-right: var(--shadow-safe-area);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      pointer-events: none;
    }

    .shape {
      width: fit-content;
      height: fit-content;
      position: absolute;
      transition:
        transform 0.3s,
        z-index 0.1s;
      transform: translateX(var(--default-x, 0)) translateY(var(--default-y, 0))
        scale(var(--default-s, 1));
      z-index: var(--default-z, 0);
      pointer-events: none;
    }
    .shape svg {
      display: block;
    }
    .shape svg path,
    .shape svg circle,
    .shape svg rect {
      pointer-events: auto;
      cursor: grab;
    }
    .shape:hover,
    .shape.cancel {
      transform: translateX(var(--hover-x, 0)) translateY(var(--hover-y, 0))
        scale(var(--hover-s, 1));
      z-index: var(--hover-z, 0);
    }
    .shape.next {
      transition: all 0.5s cubic-bezier(0.39, 0.28, 0.09, 0.95);
      pointer-events: none;
      transform: translateX(var(--next-x, 0)) translateY(var(--next-y, 0))
        scale(var(--next-s, 1));
    }
    .shape.next.coming {
      transform: translateX(var(--default-x, 0)) translateY(var(--default-y, 0))
        scale(var(--default-s, 1));
    }
  `;

  draggableController!: EdgelessDraggableElementController<DraggableShape>;

  draggingShape: DraggableShape['name'] = 'roundedRect';

  override type = ShapeTool;

  get crud() {
    return this.edgeless.std.get(EdgelessCRUDIdentifier);
  }

  get shapeShadow() {
    return this.theme === 'dark'
      ? '0 0 7px rgba(0, 0, 0, .22)'
      : '0 0 5px rgba(0, 0, 0, .2)';
  }

  private _setShapeOverlayLock(lock: boolean) {
    const controller = this.gfx.tool.currentTool$.peek();
    if (controller instanceof ShapeTool) {
      controller.setDisableOverlay(lock);
    }
  }

  initDragController() {
    if (!this.edgeless || !this.toolbarContainer) return;
    if (this.draggableController) return;
    this.draggableController = new EdgelessDraggableElementController(this, {
      edgeless: this.edgeless,
      scopeElement: this.toolbarContainer,
      standardWidth: 100,
      clickToDrag: false,
      onOverlayCreated: (overlay, element) => {
        const shapeName =
          this.draggableController.states.draggingElement?.data.name;
        if (!shapeName) return;

        this.setEdgelessTool(ShapeTool, {
          shapeName,
        });
        const controller = this.gfx.tool.currentTool$.peek();
        if (controller instanceof ShapeTool) {
          controller.clearOverlay();
        }
        overlay.element.style.filter = `drop-shadow(${this.shapeShadow})`;
        this.readyToDrop = true;
        this.draggingShape = element.data.name;
      },
      onDrop: (el, bound) => {
        const xywh = bound.serialize();
        const shape = el.data;
        const id = this.crud.addElement(CanvasElementType.SHAPE, {
          shapeType: getShapeType(shape.name),
          xywh,
          radius: getShapeRadius(shape.name),
        });
        if (!id) return;
        this.edgeless.std
          .getOptional(TelemetryProvider)
          ?.track('CanvasElementAdded', {
            control: 'toolbar:dnd',
            page: 'whiteboard editor',
            module: 'toolbar',
            segment: 'toolbar',
            type: 'shape',
            other: {
              shapeType: getShapeType(shape.name),
            },
          });

        this._setShapeOverlayLock(false);
        this.readyToDrop = false;

        this.gfx.tool.setTool(DefaultTool);
        this.gfx.selection.set({
          elements: [id],
          editing: false,
        });
      },
      onCanceled: () => {
        this._setShapeOverlayLock(false);
        this.readyToDrop = false;
      },
      onElementClick: el => {
        this.onShapeClick?.(el.data);
      },
      onEnterOrLeaveScope: (overlay, isOutside) => {
        overlay.element.style.filter = isOutside
          ? 'none'
          : `drop-shadow(${this.shapeShadow})`;
      },
    });

    this.edgeless.bindHotKey(
      {
        s: ctx => {
          // `page.keyboard.press('Shift+s')` in playwright will also trigger this 's' key event
          if (ctx.get('keyboardState').raw.shiftKey) return;

          const locked = this.gfx.viewport.locked;
          const selection = this.gfx.selection;
          if (locked || selection.editing) return;

          const currentTool = this.gfx.tool.currentToolName$.peek();

          if (this.readyToDrop) {
            if (currentTool === ShapeTool.toolName) {
              const activeIndex = shapes.findIndex(
                s => s.name === this.draggingShape
              );
              const nextIndex = (activeIndex + 1) % shapes.length;
              const next = shapes[nextIndex];
              this.draggingShape = next.name;
            }
            this.draggableController.cancelWithoutAnimation();
            const el = this.shapeContainer.querySelector(
              `.shape.${this.draggingShape}`
            ) as HTMLElement;
            if (!el) {
              console.error('Edgeless toolbar Shape element not found');
              return;
            }
            const { x, y } = this.gfx.tool.lastMouseViewPos$.peek();
            const { viewport } = this.edgeless.std.get(ViewportElementProvider);
            const { left, top } = viewport;
            const clientPos = { x: x + left, y: y + top };
            this.draggableController.dragAndMoveTo(el, clientPos);
          } else {
            if (this.gfx.tool.dragging$.peek()) return;
            let shapeName =
              this.gfx.tool.get(ShapeTool).activatedOption.shapeName;
            if (currentTool === ShapeTool.toolName) {
              shapeName = this.gfx.tool.get(ShapeTool).cycleShapeName('next');
            }
            this.setEdgelessTool(ShapeTool, {
              shapeName,
            });
          }
        },
      },
      { global: true }
    );
  }

  override render() {
    const { cancelled, dragOut, draggingElement } =
      this.draggableController?.states || {};
    const draggingShape = draggingElement?.data;
    return html`<div class="edgeless-shape-draggable">
      ${repeat(
        shapes,
        s => s.name,
        shape => {
          const isBeingDragged = draggingShape?.name === shape.name;
          const { fillColor, strokeColor } =
            this.edgeless.std.get(EditPropsStore).lastProps$.value[
              `shape:${shape.name}`
            ] || {};
          const color = this.edgeless.std
            .get(ThemeProvider)
            .generateColorProperty(fillColor);
          const stroke = this.edgeless.std
            .get(ThemeProvider)
            .generateColorProperty(strokeColor);
          const baseStyle = {
            ...buildVariablesObject(shape.style),
            filter: `drop-shadow(${this.shapeShadow})`,
            color,
            stroke,
          };
          const currStyle = styleMap({
            ...baseStyle,
            opacity: isBeingDragged ? 0 : 1,
          });
          const nextStyle = styleMap(baseStyle);
          return html`${isBeingDragged
              ? html`<div
                  style=${nextStyle}
                  class=${classMap({
                    shape: true,
                    next: true,
                    coming: !!dragOut && !cancelled,
                  })}
                >
                  ${shape.svg}
                </div>`
              : nothing}
            <div
              style=${currStyle}
              class=${classMap({
                shape: true,
                [shape.name]: true,
                cancel: isBeingDragged && !dragOut,
              })}
              @mousedown=${(e: MouseEvent) =>
                this.draggableController.onMouseDown(e, {
                  data: shape,
                  preview: shape.svg,
                })}
              @touchstart=${(e: TouchEvent) =>
                this.draggableController.onTouchStart(e, {
                  data: shape,
                  preview: shape.svg,
                })}
              @click=${(e: MouseEvent) => e.stopPropagation()}
            >
              ${shape.svg}
            </div>`;
        }
      )}
    </div>`;
  }

  override updated(_changedProperties: Map<PropertyKey, unknown>) {
    const controllerRequiredProps = ['edgeless', 'toolbarContainer'] as const;
    if (
      controllerRequiredProps.some(p => _changedProperties.has(p)) &&
      !this.draggableController
    ) {
      this.initDragController();
    }
  }

  @property({ attribute: false })
  accessor onShapeClick: (shape: DraggableShape) => void = () => {};

  @state()
  accessor readyToDrop = false;

  @query('.edgeless-shape-draggable')
  accessor shapeContainer!: HTMLDivElement;
}
