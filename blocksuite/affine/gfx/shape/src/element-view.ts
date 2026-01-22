import {
  COLLAPSIBLE_CONTAINER_SHAPES,
  CONNECTOR_TREE_SHAPES,
  ConnectorElementModel,
  CONTAINER_TITLE_SIZE,
  DefaultTheme,
  FontFamily,
  FontWeight,
  LocalShapeElementModel,
  ShapeElementModel,
  ShapeStyle,
  ShapeType,
  TextAlign,
  TextVerticalAlign,
} from '@blocksuite/affine-model';
import { Bound } from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import {
  GfxElementModelView,
  type GfxModel,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

import { normalizeShapeBound } from './element-renderer';
import { mountShapeTextEditor } from './text/edgeless-shape-text-editor';

const COLLAPSE_BUTTON_SIZE = 22;
const COLLAPSE_BUTTON_PADDING = 10;

const isContainerShape = (model: ShapeElementModel) =>
  COLLAPSIBLE_CONTAINER_SHAPES.has(model.shapeType);

const isConnectorTreeShape = (model: ShapeElementModel) =>
  CONNECTOR_TREE_SHAPES.has(model.shapeType);

const canCollapse = (model: ShapeElementModel) =>
  isContainerShape(model) || isConnectorTreeShape(model);

const getDefaultCollapsedSize = (model: ShapeElementModel) => {
  const width = Math.max(model.w, 1);
  const height = Math.max(model.h, 1);

  switch (model.shapeType) {
    case ShapeType.Container:
      return [Math.min(80, width), Math.min(80, height)] as [number, number];
    case ShapeType.VerticalContainer:
      return [width, Math.min(CONTAINER_TITLE_SIZE, height)] as [
        number,
        number,
      ];
    case ShapeType.HorizontalContainer:
      return [Math.min(CONTAINER_TITLE_SIZE, width), height] as [
        number,
        number,
      ];
    case ShapeType.List:
      return [width, Math.min(36, height)] as [number, number];
    default:
      return [width, height] as [number, number];
  }
};

const getElementById = (
  view: GfxElementModelView<ShapeElementModel>,
  id: string
) =>
  (view.surface.getElementById(id) ??
    (view.surface.store.getModelById(id) as GfxModel | null)) ||
  null;

export class ShapeElementView extends GfxElementModelView<ShapeElementModel> {
  static override type: string = 'shape';

  private _collapseButton: LocalShapeElementModel | null = null;

  override onCreated(): void {
    super.onCreated();

    this._initDblClickToEdit();
    this._initCollapseButton();
  }

  override onDestroyed(): void {
    super.onDestroyed();
    this._removeCollapseButton();
  }

  private _initDblClickToEdit(): void {
    this.on('dblclick', () => {
      const edgeless = this.std.view.getBlock(this.std.store.root!.id);

      if (
        edgeless &&
        !this.model.isLocked() &&
        this.model instanceof ShapeElementModel
      ) {
        mountShapeTextEditor(this.model, edgeless);
      }
    });
  }

  private _removeCollapseButton() {
    if (!this._collapseButton) return;
    this.surface.deleteLocalElement(this._collapseButton);
    this._collapseButton = null;
  }

  private _initCollapseButton(): void {
    if (!canCollapse(this.model)) return;

    this._collapseButton = new LocalShapeElementModel(this.model.surface);
    this._collapseButton.id = `collapse-btn-${this.model.id}`;
    this._collapseButton.groupId = this.model.id;
    this._collapseButton.responseExtension = [12, 12];
    this.surface.addLocalElement(this._collapseButton);

    const isOnElementBound = (evt: PointerEventState) => {
      if (!this._collapseButton) return false;
      const [x, y] = this.gfx.viewport.toModelCoord(evt.x, evt.y);
      const buttonBound = this._getCollapseButtonBound();
      const padding = isContainerShape(this.model) ? 8 : 4;
      const hitBound = new Bound(
        buttonBound.x - padding,
        buttonBound.y - padding,
        buttonBound.w + padding * 2,
        buttonBound.h + padding * 2
      );
      return hitBound.containsPoint([x, y]);
    };
    const buttonView = this.gfx.view.get(
      this._collapseButton.id
    ) as GfxElementModelView<LocalShapeElementModel> | null;

    const handlePointerDown = (evt: PointerEventState) => {
      if (!isOnElementBound(evt)) return;
      evt.raw.preventDefault();
      evt.raw.stopPropagation();
      this._toggleCollapse();
    };

    buttonView?.on('pointerenter', () => {
      this.gfx.cursor$.value = 'pointer';
    });
    buttonView?.on('pointerleave', () => {
      this.gfx.cursor$.value = 'default';
    });
    buttonView?.on('pointerdown', handlePointerDown);
    this.on('pointerdown', handlePointerDown);

    this.disposable.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (
          key === 'xywh' ||
          key === 'shapeType' ||
          key === 'collapsed' ||
          key === 'hidden' ||
          key === 'opacity'
        ) {
          this._updateCollapseButton();
        }
      })
    );

    this._updateCollapseButton();
    this._applyInitialCollapse();
  }

  private _applyInitialCollapse() {
    if (!this.model.collapsed) return;
    if (isContainerShape(this.model)) {
      const bound = this.model.elementBound;
      const expandedSize =
        this.model.expandedSize ?? ([bound.w, bound.h] as [number, number]);
      this.model.expandedSize = expandedSize;
      const collapsedSize =
        this.model.collapsedSize ?? getDefaultCollapsedSize(this.model);
      this.model.collapsedSize = collapsedSize;
      if (bound.w !== collapsedSize[0] || bound.h !== collapsedSize[1]) {
        this.model.xywh = new Bound(
          bound.x,
          bound.y,
          collapsedSize[0],
          collapsedSize[1]
        ).serialize();
      }
      this._hideContainedElements(
        new Bound(bound.x, bound.y, expandedSize[0], expandedSize[1])
      );
      return;
    }

    if (isConnectorTreeShape(this.model)) {
      this._hideConnectorDescendants(this.model.id);
    }
  }

  private _updateCollapseButton(): void {
    if (!this._collapseButton) return;
    if (!canCollapse(this.model)) {
      this._removeCollapseButton();
      return;
    }

    const buttonBound = this._getCollapseButtonBound();

    this._collapseButton.xywh = buttonBound.serialize();
    this._collapseButton.shapeType = ShapeType.Rect;
    this._collapseButton.radius = 2;
    this._collapseButton.filled = true;
    this._collapseButton.fillColor = DefaultTheme.StrokeColorShortMap.Grey;
    this._collapseButton.strokeColor = DefaultTheme.pureBlack;
    this._collapseButton.strokeWidth = 1.5;
    this._collapseButton.shapeStyle = ShapeStyle.General;
    this._collapseButton.text = this.model.collapsed ? '+' : '-';
    this._collapseButton.color = DefaultTheme.pureBlack;
    this._collapseButton.padding = [0, 0];
    this._collapseButton.textAlign = TextAlign.Center;
    this._collapseButton.textVerticalAlign = TextVerticalAlign.Center;
    this._collapseButton.fontFamily = FontFamily.Inter;
    this._collapseButton.fontWeight = FontWeight.SemiBold;
    this._collapseButton.fontSize = 11;
    this._collapseButton.hidden = this.model.hidden;
    this._collapseButton.opacity = this.model.opacity ?? 1;
  }

  private _getCollapseButtonBound(): Bound {
    const bound = this.model.elementBound;
    return new Bound(
      bound.x + COLLAPSE_BUTTON_PADDING,
      bound.y + COLLAPSE_BUTTON_PADDING,
      COLLAPSE_BUTTON_SIZE,
      COLLAPSE_BUTTON_SIZE
    );
  }

  private _toggleCollapse(): void {
    if (isContainerShape(this.model)) {
      this._toggleContainerCollapse();
      return;
    }
    if (isConnectorTreeShape(this.model)) {
      this._toggleConnectorCollapse();
    }
  }

  private _toggleContainerCollapse(): void {
    const bound = this.model.elementBound;
    const willCollapse = !this.model.collapsed;
    const expandedSize =
      this.model.expandedSize ?? ([bound.w, bound.h] as [number, number]);

    console.debug('[collapse] toggle container', {
      id: this.model.id,
      shapeType: this.model.shapeType,
      willCollapse,
      bound: { x: bound.x, y: bound.y, w: bound.w, h: bound.h },
      expandedSize,
      collapsedSize: this.model.collapsedSize,
    });

    if (willCollapse) {
      this.model.expandedSize = expandedSize;
      const collapsedSize =
        this.model.collapsedSize ?? getDefaultCollapsedSize(this.model);
      this.model.collapsedSize = collapsedSize;
      this.model.xywh = new Bound(
        bound.x,
        bound.y,
        collapsedSize[0],
        collapsedSize[1]
      ).serialize();
      this._hideContainedElements(
        new Bound(bound.x, bound.y, bound.w, bound.h)
      );
      this.model.collapsed = true;
      return;
    }

    this.model.xywh = new Bound(
      bound.x,
      bound.y,
      expandedSize[0],
      expandedSize[1]
    ).serialize();
    this._showContainedElements(
      new Bound(bound.x, bound.y, expandedSize[0], expandedSize[1])
    );
    this.model.collapsed = false;
  }

  private _toggleConnectorCollapse(): void {
    const willCollapse = !this.model.collapsed;
    if (willCollapse) {
      this._hideConnectorDescendants(this.model.id);
      this.model.collapsed = true;
    } else {
      this._showConnectorDescendants(this.model.id);
      this.model.collapsed = false;
    }
  }

  private _getContainedElements(bound: Bound) {
    return this.gfx
      .getElementsByBound(bound, { type: 'canvas' })
      .filter(el =>
        !(el instanceof ConnectorElementModel) &&
        el instanceof ShapeElementModel
          ? el.id !== this.model.id && bound.contains(el.elementBound)
          : bound.contains(el.elementBound)
      );
  }

  private _hideContainedElements(bound: Bound) {
    const elements = this._getContainedElements(bound);
    console.debug('[collapse] hide contained', {
      id: this.model.id,
      bound: { x: bound.x, y: bound.y, w: bound.w, h: bound.h },
      elements: elements.map(el => el.id),
    });
    elements.forEach(el => {
      if ('hidden' in el) {
        el.hidden = true;
      }
      if (el instanceof ShapeElementModel) {
        el.collapseProxyId = this.model.id;
      }
    });
  }

  private _showContainedElements(bound: Bound) {
    const elements = this._getContainedElements(bound);
    const proxiedShapes = (
      this.surface.getElementsByType('shape') as ShapeElementModel[]
    ).filter(shape => shape.collapseProxyId === this.model.id);
    const surface = this.surface as unknown as {
      getConnectors: (id: string) => ConnectorElementModel[];
    };
    console.debug('[collapse] show contained', {
      id: this.model.id,
      bound: { x: bound.x, y: bound.y, w: bound.w, h: bound.h },
      elements: elements.map(el => el.id),
      proxied: proxiedShapes.map(shape => shape.id),
    });
    elements.forEach(el => {
      if ('hidden' in el) {
        el.hidden = false;
      }
      if (el instanceof ShapeElementModel) {
        el.collapseProxyId = null;
      }
    });
    proxiedShapes.forEach(shape => {
      if (elements.includes(shape)) return;
      shape.hidden = false;
      shape.collapseProxyId = null;
    });

    const affectedIds = new Set<string>();
    elements.forEach(el => {
      if (el instanceof ShapeElementModel) affectedIds.add(el.id);
    });
    proxiedShapes.forEach(shape => affectedIds.add(shape.id));

    const connectors = new Set<ConnectorElementModel>();
    affectedIds.forEach(id => {
      surface.getConnectors(id).forEach(connector => connectors.add(connector));
    });

    connectors.forEach(connector => {
      if (!connector.hidden) return;
      connector.hidden = false;
    });
  }

  private _hideConnectorDescendants(rootId: string) {
    const visited = new Set<string>();
    const surface = this.surface as unknown as {
      getConnectors: (id: string) => ConnectorElementModel[];
    };
    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const connectors = surface.getConnectors(id);
      connectors.forEach((connector: ConnectorElementModel) => {
        if (connector.source.id !== id || !connector.target.id) return;
        if (connector.target.id === rootId) return;
        const target = getElementById(this, connector.target.id);
        if (!target) return;
        connector.hidden = true;
        if ('hidden' in target) target.hidden = true;
        traverse(target.id);
      });
    };
    traverse(rootId);
  }

  private _showConnectorDescendants(rootId: string) {
    const visited = new Set<string>();
    const surface = this.surface as unknown as {
      getConnectors: (id: string) => ConnectorElementModel[];
    };
    const queue: Array<{ id: string; blocked: boolean }> = [
      { id: rootId, blocked: false },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      const connectors = surface.getConnectors(current.id);
      connectors.forEach((connector: ConnectorElementModel) => {
        if (connector.source.id !== current.id || !connector.target.id) return;
        if (connector.target.id === rootId) return;
        const target = getElementById(this, connector.target.id);
        if (!target) return;
        const shouldHide = current.blocked;
        connector.hidden = shouldHide;
        if ('hidden' in target) {
          const hasProxy =
            target instanceof ShapeElementModel && target.collapseProxyId;
          if (!shouldHide && hasProxy) {
            return;
          }
          target.hidden = shouldHide;
        }
        const isCollapsedChild =
          target instanceof ShapeElementModel &&
          isConnectorTreeShape(target) &&
          target.collapsed;
        queue.push({
          id: target.id,
          blocked: shouldHide || isCollapsedChild,
        });
      });
    }
  }
}

export const ShapeViewInteraction =
  GfxViewInteractionExtension<ShapeElementView>(ShapeElementView.type, {
    handleResize: () => {
      return {
        beforeResize({ elements, set }) {
          const shouldLockRatio = elements.some(element => {
            if (!(element instanceof ShapeElementView)) return false;
            return Boolean(element.model.lockAspectRatio);
          });

          if (shouldLockRatio) {
            set({ lockRatio: true });
          }
        },
        onResizeMove({ newBound, model }) {
          const normalizedBound = normalizeShapeBound(model, newBound);

          model.xywh = normalizedBound.serialize();
          if (model instanceof ShapeElementModel && isContainerShape(model)) {
            const size: [number, number] = [
              normalizedBound.w,
              normalizedBound.h,
            ];
            if (model.collapsed) {
              model.collapsedSize = size;
            } else {
              model.expandedSize = size;
            }
          }
        },
      };
    },
  });
