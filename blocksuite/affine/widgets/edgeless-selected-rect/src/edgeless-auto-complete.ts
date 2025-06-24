import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
  getSurfaceComponent,
  isNoteBlock,
  Overlay,
  OverlayIdentifier,
  type RoughCanvas,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectionOverlay,
  ConnectorPathGenerator,
} from '@blocksuite/affine-gfx-connector';
import { mountShapeTextEditor } from '@blocksuite/affine-gfx-shape';
import type {
  Connection,
  ConnectorElementModel,
  NoteBlockModel,
  ShapeType,
} from '@blocksuite/affine-model';
import {
  DEFAULT_NOTE_HEIGHT,
  DefaultTheme,
  LayoutType,
  MindmapElementModel,
  ShapeElementModel,
  shapeMethods,
} from '@blocksuite/affine-model';
import { ToolbarRegistryIdentifier } from '@blocksuite/affine-shared/services';
import type { SelectedRect } from '@blocksuite/affine-shared/types';
import { handleNativeRangeAtPoint } from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { Bound, IVec } from '@blocksuite/global/gfx';
import { Vec } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  ArrowUpBigIcon,
  PlusIcon,
  SiblingNodeIcon,
  SubNodeIcon,
} from '@blocksuite/icons/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  stdContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { EdgelessAutoCompletePanel } from './auto-complete-panel.js';
import {
  createEdgelessElement,
  Direction,
  getPosition,
  isShape,
  MAIN_GAP,
  nextBound,
} from './utils.js';

class AutoCompleteOverlay extends Overlay {
  linePoints: IVec[] = [];

  renderShape: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  stroke = '';

  override render(ctx: CanvasRenderingContext2D, _rc: RoughCanvas) {
    if (this.linePoints.length && this.renderShape) {
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = this.stroke;
      ctx.beginPath();
      this.linePoints.forEach((p, index) => {
        if (index === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();

      this.renderShape(ctx);
      ctx.stroke();
    }
  }
}

export class EdgelessAutoComplete extends WithDisposable(LitElement) {
  static override styles = css`
    .edgeless-auto-complete-container {
      position: absolute;
      z-index: 1;
      pointer-events: none;
    }
    .edgeless-auto-complete-arrow-wrapper {
      width: 72px;
      height: 44px;
      position: absolute;
      z-index: 1;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .edgeless-auto-complete-arrow-wrapper.hidden {
      display: none;
    }
    .edgeless-auto-complete-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 19px;
      cursor: pointer;
      pointer-events: auto;
      transition:
        background 0.3s linear,
        box-shadow 0.2s linear;
    }
    .edgeless-auto-complete-arrow-wrapper.mindmap {
      width: 26px;
      height: 26px;
    }

    .edgeless-auto-complete-arrow-wrapper:hover
      > .edgeless-auto-complete-arrow {
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-shadow-1);
      background: var(--affine-white);
    }

    .edgeless-auto-complete-arrow-wrapper
      > .edgeless-auto-complete-arrow:hover {
      border: 1px solid var(--affine-white-10);
      box-shadow: var(--affine-shadow-1);
      background: var(--affine-primary-color);
    }

    .edgeless-auto-complete-arrow-wrapper.mindmap
      > .edgeless-auto-complete-arrow {
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-shadow-1);
      background: var(--affine-white);

      transition:
        background 0.3s linear,
        color 0.2s linear;
    }

    .edgeless-auto-complete-arrow-wrapper.mindmap
      > .edgeless-auto-complete-arrow:hover {
      border: 1px solid var(--affine-white-10);
      box-shadow: var(--affine-shadow-1);
      background: var(--affine-primary-color);
    }

    .edgeless-auto-complete-arrow svg {
      fill: #77757d;
      color: #77757d;
    }
    .edgeless-auto-complete-arrow:hover svg {
      fill: #ffffff;
      color: #ffffff;
    }
  `;

  private get _surface() {
    return getSurfaceBlock(this.std.store);
  }

  private _autoCompleteOverlay!: AutoCompleteOverlay;

  private readonly _onPointerDown = (e: PointerEvent, type: Direction) => {
    const viewportRect = this.gfx.viewport.boundingClientRect;
    const start = this.gfx.viewport.toModelCoord(
      e.clientX - viewportRect.left,
      e.clientY - viewportRect.top
    );

    if (!this.edgeless.std.event) return;

    let connector: ConnectorElementModel | null;

    this._disposables.addFromEvent(document, 'pointermove', e => {
      const point = this.gfx.viewport.toModelCoord(
        e.clientX - viewportRect.left,
        e.clientY - viewportRect.top
      );
      if (Vec.dist(start, point) > 8 && !this._isMoving) {
        if (!this.canShowAutoComplete) return;
        this._isMoving = true;
        const { startPosition } = getPosition(type);
        connector = this._addConnector(
          {
            id: this.current.id,
            position: startPosition,
          },
          {
            position: point,
          }
        );
      }
      if (this._isMoving) {
        if (!connector) {
          return;
        }
        const otherSideId = connector.source.id;

        connector.target = this.connectionOverlay.renderConnector(
          point,
          otherSideId ? [otherSideId] : []
        );

        this.std.get(ToolbarRegistryIdentifier).flags.hide();
      }
    });

    this._disposables.addFromEvent(document, 'pointerup', e => {
      if (!this._isMoving) {
        this._generateElementOnClick(type);
      } else if (connector && !connector.target.id) {
        this.gfx.selection.clear();
        this._createAutoCompletePanel(e, connector);
      }

      this.std.get(ToolbarRegistryIdentifier).flags.show();

      this._isMoving = false;
      this.connectionOverlay.clear();
      this._disposables.dispose();
      this._disposables = new DisposableGroup();
    });
  };

  private _pathGenerator!: ConnectorPathGenerator;

  private _timer: ReturnType<typeof setTimeout> | null = null;

  get canShowAutoComplete() {
    const { current } = this;
    return isShape(current) || isNoteBlock(current);
  }

  get connectionOverlay() {
    return this.std.get(OverlayIdentifier('connection')) as ConnectionOverlay;
  }

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  private _addConnector(source: Connection, target: Connection) {
    const id = this.crud.addElement(CanvasElementType.CONNECTOR, {
      source,
      target,
    });
    if (!id) return null;
    return this.crud.getElementById(id) as ConnectorElementModel;
  }

  private _addMindmapNode(target: 'sibling' | 'child') {
    const mindmap = this.current.group;

    if (!(mindmap instanceof MindmapElementModel)) return;

    const parent =
      target === 'sibling'
        ? (mindmap.getParentNode(this.current.id) ?? this.current)
        : this.current;

    const parentNode = mindmap.getNode(parent.id);

    if (!parentNode) return;

    const newNode = mindmap.addNode(
      parentNode.id,
      target === 'sibling' ? this.current.id : undefined,
      undefined,
      undefined
    );

    if (parentNode.detail.collapsed) {
      mindmap.toggleCollapse(parentNode);
    }

    requestAnimationFrame(() => {
      mountShapeTextEditor(
        this.crud.getElementById(newNode) as ShapeElementModel,
        this.edgeless
      );
    });
  }

  private _computeLine(
    type: Direction,
    curShape: ShapeElementModel,
    nextBound: Bound
  ) {
    const startBound = this.current.elementBound;
    const { startPosition, endPosition } = getPosition(type);
    const nextShape = {
      xywh: nextBound.serialize(),
      rotate: curShape.rotate,
      shapeType: curShape.shapeType,
    };
    const startPoint = curShape.getRelativePointLocation(startPosition);
    const endPoint = curShape.getRelativePointLocation.call(
      nextShape,
      endPosition
    );

    return this._pathGenerator.generateOrthogonalConnectorPath({
      startBound,
      endBound: nextBound,
      startPoint,
      endPoint,
    });
  }

  private _computeNextBound(type: Direction) {
    if (isShape(this.current)) {
      const connectedShapes = this._getConnectedElements(this.current).filter(
        e => e instanceof ShapeElementModel
      ) as ShapeElementModel[];
      return nextBound(type, this.current, connectedShapes);
    } else {
      const bound = this.current.elementBound;
      switch (type) {
        case Direction.Right: {
          bound.x += bound.w + MAIN_GAP;
          break;
        }
        case Direction.Bottom: {
          bound.y += bound.h + MAIN_GAP;
          break;
        }
        case Direction.Left: {
          bound.x -= bound.w + MAIN_GAP;
          break;
        }
        case Direction.Top: {
          bound.y -= bound.h + MAIN_GAP;
          break;
        }
      }
      return bound;
    }
  }

  private _createAutoCompletePanel(
    e: PointerEvent,
    connector: ConnectorElementModel
  ) {
    if (!this.canShowAutoComplete) return;

    const position = this.gfx.viewport.toModelCoord(e.clientX, e.clientY);
    const autoCompletePanel = new EdgelessAutoCompletePanel(
      position,
      this.edgeless,
      this.current,
      connector
    );

    this.edgeless.append(autoCompletePanel);
  }

  private _generateElementOnClick(type: Direction) {
    const { store } = this.edgeless;
    const bound = this._computeNextBound(type);
    const id = createEdgelessElement(this.edgeless, this.current, bound);
    if (!id) return;
    if (isShape(this.current)) {
      const { startPosition, endPosition } = getPosition(type);
      this._addConnector(
        {
          id: this.current.id,
          position: startPosition,
        },
        {
          id,
          position: endPosition,
        }
      );

      mountShapeTextEditor(
        this.crud.getElementById(id) as ShapeElementModel,
        this.edgeless
      );
    } else {
      const model = store.getModelById(id);
      if (!model) {
        return;
      }
      const [x, y] = this.gfx.viewport.toViewCoord(
        bound.center[0],
        bound.y + DEFAULT_NOTE_HEIGHT / 2
      );
      requestAnimationFrame(() => {
        handleNativeRangeAtPoint(x, y);
      });
    }

    this.gfx.selection.set({
      elements: [id],
      editing: true,
    });
    this.removeOverlay();
  }

  private _getConnectedElements(element: ShapeElementModel) {
    if (!this._surface) return [];

    return this._surface.getConnectors(element.id).reduce((prev, current) => {
      if (current.target.id === element.id && current.source.id) {
        prev.push(
          this.crud.getElementById(current.source.id) as ShapeElementModel
        );
      }
      if (current.source.id === element.id && current.target.id) {
        prev.push(
          this.crud.getElementById(current.target.id) as ShapeElementModel
        );
      }

      return prev;
    }, [] as ShapeElementModel[]);
  }

  private _getMindmapButtons() {
    const mindmap = this.current.group as MindmapElementModel;
    const mindmapDirection =
      this.current instanceof ShapeElementModel &&
      mindmap instanceof MindmapElementModel
        ? mindmap.getLayoutDir(this.current.id)
        : null;
    const isRoot = mindmap?.tree.id === this.current.id;
    const mindmapNode = mindmap.getNode(this.current.id);

    let buttons: [
      Direction,
      'child' | 'sibling',
      LayoutType.LEFT | LayoutType.RIGHT,
    ][] = [];

    switch (mindmapDirection) {
      case LayoutType.LEFT:
        buttons = [[Direction.Left, 'child', LayoutType.LEFT]];

        if (!isRoot) {
          buttons.push([Direction.Bottom, 'sibling', mindmapDirection]);
        }
        break;
      case LayoutType.RIGHT:
        buttons = [[Direction.Right, 'child', LayoutType.RIGHT]];

        if (!isRoot) {
          buttons.push([Direction.Bottom, 'sibling', mindmapDirection]);
        }
        break;
      case LayoutType.BALANCE:
        buttons = [
          [Direction.Right, 'child', LayoutType.RIGHT],
          [Direction.Left, 'child', LayoutType.LEFT],
        ];
        break;
      default:
        buttons = [];
    }

    return buttons.length
      ? {
          mindmapNode,
          buttons,
        }
      : null;
  }

  private _initOverlay() {
    const surface = getSurfaceComponent(this.std);
    if (!surface) return;
    this._autoCompleteOverlay = new AutoCompleteOverlay(this.gfx);
    surface.renderer.addOverlay(this._autoCompleteOverlay);
  }

  private _renderArrow() {
    const isShape = this.current instanceof ShapeElementModel;
    const { selectedRect } = this;
    const { zoom } = this.gfx.viewport;
    const width = 72;
    const height = 44;

    // Auto-complete arrows for shape and note are different
    // Shape: right, bottom, left, top
    // Note: right, left
    const arrowDirections = isShape
      ? [Direction.Right, Direction.Bottom, Direction.Left, Direction.Top]
      : [Direction.Right, Direction.Left];
    const arrowMargin = isShape ? height / 2 : height * (2 / 3);
    const Arrows = arrowDirections.map(type => {
      let transform = '';

      const iconSize = { width: '16px', height: '16px' };
      const icon = (isShape ? ArrowUpBigIcon : PlusIcon)(iconSize);

      switch (type) {
        case Direction.Top:
          transform += `translate(${
            selectedRect.width / 2
          }px, ${-arrowMargin}px)`;
          break;
        case Direction.Right:
          transform += `translate(${selectedRect.width + arrowMargin}px, ${
            selectedRect.height / 2
          }px)`;

          isShape && (transform += `rotate(90deg)`);
          break;
        case Direction.Bottom:
          transform += `translate(${selectedRect.width / 2}px, ${
            selectedRect.height + arrowMargin
          }px)`;
          isShape && (transform += `rotate(180deg)`);
          break;
        case Direction.Left:
          transform += `translate(${-arrowMargin}px, ${
            selectedRect.height / 2
          }px)`;
          isShape && (transform += `rotate(-90deg)`);
          break;
      }
      transform += `translate(${-width / 2}px, ${-height / 2}px)`;
      const arrowWrapperClasses = classMap({
        'edgeless-auto-complete-arrow-wrapper': true,
        hidden: !isShape && type === Direction.Left && zoom >= 1.5,
      });

      return html`<div
        class=${arrowWrapperClasses}
        style=${styleMap({
          transform,
          transformOrigin: 'left top',
        })}
      >
        <div
          class="edgeless-auto-complete-arrow"
          @mouseenter=${() => {
            this._timer = setTimeout(() => {
              if (this.current instanceof ShapeElementModel) {
                const bound = this._computeNextBound(type);
                const path = this._computeLine(type, this.current, bound);
                this._showNextShape(
                  this.current,
                  bound,
                  path,
                  this.current.shapeType
                );
              }
            }, 300);
          }}
          @mouseleave=${() => {
            this.removeOverlay();
          }}
          @pointerdown=${(e: PointerEvent) => {
            this._onPointerDown(e, type);
          }}
        >
          ${icon}
        </div>
      </div>`;
    });

    return Arrows;
  }

  private _renderMindMapButtons() {
    const mindmapButtons = this._getMindmapButtons();

    if (!mindmapButtons) {
      return;
    }

    const { selectedRect } = this;
    const { zoom } = this.gfx.viewport;
    const size = 26;
    const buttonMargin =
      (mindmapButtons.mindmapNode?.children.length ?? 0) > 0
        ? size / 2 + 32 * zoom
        : size / 2 + 6;
    const verticalMargin = size / 2 + 6;

    return mindmapButtons.buttons.map(type => {
      let transform = '';

      const [position, target, layout] = type;
      const isLeftLayout = layout === LayoutType.LEFT;
      const icon = (target === 'child' ? SubNodeIcon : SiblingNodeIcon)({
        width: '16px',
        height: '16px',
      });

      switch (position) {
        case Direction.Bottom:
          transform += `translate(${selectedRect.width / 2}px, ${
            selectedRect.height + verticalMargin
          }px)`;
          isLeftLayout && (transform += `scale(-1)`);
          break;
        case Direction.Right:
          transform += `translate(${selectedRect.width + buttonMargin}px, ${
            selectedRect.height / 2
          }px)`;
          break;
        case Direction.Left:
          transform += `translate(${-buttonMargin}px, ${
            selectedRect.height / 2
          }px)`;

          transform += `scale(-1)`;
          break;
      }

      transform += `translate(${-size / 2}px, ${-size / 2}px)`;

      const arrowWrapperClasses = classMap({
        'edgeless-auto-complete-arrow-wrapper': true,
        hidden: position === Direction.Left && zoom >= 1.5,
        mindmap: true,
      });

      return html`<div
        class=${arrowWrapperClasses}
        style=${styleMap({
          transform,
          transformOrigin: 'left top',
        })}
      >
        <div
          class="edgeless-auto-complete-arrow"
          @pointerdown=${() => {
            this._addMindmapNode(target);
          }}
        >
          ${icon}
        </div>
      </div>`;
    });
  }

  private _showNextShape(
    current: ShapeElementModel,
    bound: Bound,
    path: IVec[],
    targetType: ShapeType
  ) {
    const surface = getSurfaceComponent(this.std);
    if (!surface) return;

    this._autoCompleteOverlay.stroke = surface.renderer.getColorValue(
      current.strokeColor,
      DefaultTheme.shapeStrokeColor,
      true
    );
    this._autoCompleteOverlay.linePoints = path;
    this._autoCompleteOverlay.renderShape = ctx => {
      shapeMethods[targetType].draw(ctx, { ...bound, rotate: current.rotate });
    };
    surface.refresh();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._pathGenerator = new ConnectorPathGenerator({
      getElementById: id => this.crud.getElementById(id),
    });
    this._initOverlay();
  }

  override firstUpdated() {
    const { _disposables, edgeless, gfx } = this;

    _disposables.add(
      this.gfx.selection.slots.updated.subscribe(() => {
        this._autoCompleteOverlay.linePoints = [];
        this._autoCompleteOverlay.renderShape = null;
      })
    );

    _disposables.add(
      gfx.selection.slots.updated.subscribe(() => {
        this.requestUpdate();
      })
    );

    _disposables.add(() => this.removeOverlay());

    _disposables.add(
      edgeless.host.event.add('pointerMove', ctx => {
        const evt = ctx.get('pointerState');
        const [x, y] = gfx.viewport.toModelCoord(evt.x, evt.y);
        const elm = gfx.getElementByPoint(x, y);

        if (!elm) {
          this._isHover = false;
          return;
        }

        this._isHover = elm === this.current ? true : false;
      })
    );

    this.edgeless.handleEvent('dragStart', () => {
      this._isMoving = true;
    });
    this.edgeless.handleEvent('dragEnd', () => {
      this._isMoving = false;
    });
  }

  private _canAutoComplete() {
    const selection = this.gfx.selection;
    return (
      selection.selectedElements.length === 1 &&
      (selection.selectedElements[0] instanceof ShapeElementModel ||
        isNoteBlock(selection.selectedElements[0]))
    );
  }

  removeOverlay() {
    this._timer && clearTimeout(this._timer);
    const surface = getSurfaceComponent(this.std);
    if (!surface) return;
    surface.renderer.removeOverlay(this._autoCompleteOverlay);
  }

  override render() {
    const isShape = this.current instanceof ShapeElementModel;
    const isMindMap = this.current.group instanceof MindmapElementModel;

    if (
      this._isMoving ||
      (this._isHover && !isShape && !this._canAutoComplete())
    ) {
      this.removeOverlay();
      return nothing;
    }
    const { selectedRect } = this;

    return html`<div
      class="edgeless-auto-complete-container"
      style=${styleMap({
        top: selectedRect.top + 'px',
        left: selectedRect.left + 'px',
        width: selectedRect.width + 'px',
        height: selectedRect.height + 'px',
        transform: `rotate(${selectedRect.rotate}deg)`,
      })}
    >
      ${isMindMap ? this._renderMindMapButtons() : this._renderArrow()}
    </div>`;
  }

  @state()
  private accessor _isHover = true;

  @state()
  private accessor _isMoving = false;

  @property({ attribute: false })
  accessor current!: ShapeElementModel | NoteBlockModel;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor selectedRect!: SelectedRect;

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;
}
