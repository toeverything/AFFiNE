import {
  LayoutType,
  LocalShapeElementModel,
  type MindmapElementModel,
  type MindmapNode,
  type MindmapRoot,
} from '@blocksuite/affine-model';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import { requestThrottledConnectedFrame } from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import {
  type BoxSelectionContext,
  GfxElementModelView,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

import { handleLayout } from './utils.js';

export class MindMapView extends GfxElementModelView<MindmapElementModel> {
  static override type = 'mindmap';

  private readonly _collapseButtons = new Map<string, LocalShapeElementModel>();

  private _hoveredState = new Map<
    string,
    {
      button: boolean;
      node: boolean;
    }
  >();

  /**
   *
   * @param node The mindmap node or its id to get the collapse button
   * @returns
   */
  getCollapseButton(node: MindmapNode | string) {
    const id = typeof node === 'string' ? node : node.id;
    return this._collapseButtons.get(`collapse-btn-${id}`);
  }

  private _initCollapseButtons() {
    const updateButtons = requestThrottledConnectedFrame(() => {
      if (!this.isConnected) {
        return;
      }

      const visited = new Set<LocalShapeElementModel>();

      this.model.traverse(node => {
        const btn = this._updateCollapseButton(node);

        btn && visited.add(btn);
      });

      this._collapseButtons.forEach(btn => {
        if (!visited.has(btn)) {
          this.surface.deleteLocalElement(btn);
          this._collapseButtons.delete(btn.id);
          const hoveredId = btn.id.replace('collapse-btn-', '');

          this._hoveredState.delete(hoveredId);
        }
      });
    });

    this.disposable.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'layoutType' || key === 'style') {
          updateButtons();
        }
      })
    );

    this.disposable.add(
      this.surface.elementUpdated.subscribe(payload => {
        if (this.model.children.has(payload.id)) {
          if (payload.props['xywh']) {
            updateButtons();
          }
          if (
            payload.props['hidden'] !== undefined ||
            payload.props['opacity'] !== undefined
          ) {
            this._updateButtonVisibility(payload.id);
          }
        }
      })
    );

    this.model.children.observe(updateButtons);

    this.disposable.add(() => {
      this.model.children.unobserve(updateButtons);
    });

    updateButtons();
  }

  private _needToUpdateButtonStyle(options: {
    button: LocalShapeElementModel;
    node: MindmapNode;
    updateKey?: boolean;
  }) {
    const { button, node } = options;
    const layout = this.model.getLayoutDir(node);
    const cacheKey = `${node.detail.collapsed ?? false}-${layout}-${node.element.xywh}-${this.model.style}`;

    if (button.cache.get('MINDMAP_COLLAPSE_BUTTON') === cacheKey) {
      return false;
    } else if (options.updateKey) {
      button.cache.set('MINDMAP_COLLAPSE_BUTTON', cacheKey);
    }

    return true;
  }

  private _setLayoutMethod() {
    this.model.setLayoutMethod(function (
      this: MindmapElementModel,
      tree: MindmapNode | MindmapRoot = this.tree,
      options: {
        applyStyle?: boolean;
        layoutType?: LayoutType;
        stashed?: boolean;
      } = {
        applyStyle: true,
        stashed: true,
      }
    ) {
      const { stashed, applyStyle, layoutType } = Object.assign(
        {
          applyStyle: true,
          calculateTreeBound: true,
          stashed: true,
        },
        options
      );

      const pop = stashed ? this.stashTree(tree) : null;
      handleLayout(this, tree, applyStyle, layoutType);
      pop?.();
    });
  }

  private _setVisibleOnSelection() {
    let lastNode: null | string = null;
    this.disposable.add(
      this.gfx.selection.slots.updated.subscribe(() => {
        const elm = this.gfx.selection.firstElement;

        if (lastNode) {
          this._updateButtonVisibility(lastNode);
        }

        if (
          this.gfx.selection.selectedElements.length === 1 &&
          elm?.id &&
          this.model.children.has(elm.id)
        ) {
          const button = this.getCollapseButton(elm.id);

          if (!button) {
            return;
          }

          this._updateButtonVisibility(elm.id);
          lastNode = elm.id;
        }
      })
    );
  }

  private _updateButtonVisibility(node: string) {
    const latestNode = this.model.getNode(node);
    const buttonModel = this.getCollapseButton(node);

    if (!buttonModel) {
      return;
    }

    if (!latestNode) {
      buttonModel.opacity = 0;
      buttonModel.hidden = true;
      return;
    }

    const hoveredState = this._hoveredState.get(node) ?? {
      button: false,
      node: false,
    };

    const hovered = hoveredState.button || hoveredState.node;
    const hasChildren = (latestNode.children.length ?? 0) > 0;
    const notHidden = !latestNode.element.hidden;
    const isNodeSelected =
      this.gfx.selection.firstElement === latestNode.element;
    const collapsed = latestNode.detail.collapsed ?? false;

    buttonModel.hidden = latestNode.element.hidden;
    buttonModel.opacity =
      (hasChildren && notHidden && (collapsed || isNodeSelected || hovered)
        ? 1
        : 0) * (latestNode.element.opacity ?? 1);
  }

  private _updateCollapseButton(node: MindmapNode) {
    if (!node?.element || node.children.length === 0) return null;

    const id = `collapse-btn-${node.id}`;
    const alreadyCreated = this._collapseButtons.has(id);
    const collapseButton =
      this._collapseButtons.get(id) ||
      new LocalShapeElementModel(this.model.surface);
    const collapsed = node.detail.collapsed ?? false;

    if (
      this._needToUpdateButtonStyle({
        button: collapseButton,
        node,
        updateKey: true,
      })
    ) {
      const style = this.model.styleGetter.getNodeStyle(
        node,
        this.model.getPath(node)
      );
      const layout = this.model.getLayoutDir(node);
      const buttonStyle = collapsed ? style.expandButton : style.collapseButton;

      Object.entries(buttonStyle).forEach(([key, value]) => {
        // @ts-expect-error key is string
        collapseButton[key as unknown] = value;
      });

      const nodeElementBound = node.element.elementBound;
      const buttonBound = nodeElementBound.moveDelta(
        layout === LayoutType.LEFT
          ? -6 - buttonStyle.width
          : 6 + nodeElementBound.w,
        (nodeElementBound.h - buttonStyle.height) / 2
      );

      buttonBound.w = buttonStyle.width;
      buttonBound.h = buttonStyle.height;

      collapseButton.responseExtension = [16, 16];
      collapseButton.xywh = buttonBound.serialize();
      collapseButton.groupId = this.model.id;
      collapseButton.text = collapsed ? node.children.length.toString() : '';
    }

    if (!alreadyCreated) {
      collapseButton.id = id;
      collapseButton.opacity = !node.element.hidden && collapsed ? 1 : 0;

      this._collapseButtons.set(id, collapseButton);
      this.surface.addLocalElement(collapseButton);

      const hoveredState = {
        button: false,
        node: false,
      };
      const buttonView = this.gfx.view.get(id) as GfxElementModelView;
      const isOnElementBound = (evt: PointerEventState) => {
        const [x, y] = this.gfx.viewport.toModelCoord(evt.x, evt.y);

        return buttonView.model.includesPoint(
          x,
          y,
          { useElementBound: true },
          this.gfx.std.host
        );
      };

      this._hoveredState = this._hoveredState.set(node.id, hoveredState);

      buttonView.on('pointerenter', () => {
        hoveredState.button = true;
        this._updateButtonVisibility(node.id);
      });
      buttonView.on('pointermove', evt => {
        const latestNode = this.model.getNode(node.id);
        if (
          latestNode &&
          !latestNode.element.hidden &&
          latestNode.children.length > 0
        ) {
          if (isOnElementBound(evt)) {
            this.gfx.cursor$.value = 'pointer';
          } else {
            this.gfx.cursor$.value = 'default';
          }
        }
      });
      buttonView.on('pointerleave', () => {
        this.gfx.cursor$.value = 'default';

        hoveredState.button = false;
        this._updateButtonVisibility(node.id);
      });
      buttonView.on('click', evt => {
        const latestNode = this.model.getNode(node.id);
        const telemetry = this.gfx.std.getOptional(TelemetryProvider);

        if (latestNode && isOnElementBound(evt)) {
          if (telemetry) {
            telemetry.track('ExpandedAndCollapsed', {
              page: 'whiteboard editor',
              segment: 'mind map',
              type: latestNode.detail.collapsed ? 'expand' : 'collapse',
            });
          }

          this.model.toggleCollapse(latestNode!, { layout: true });
        }
      });

      const nodeView = this.gfx.view.get(node.id) as GfxElementModelView;

      nodeView.on('pointerenter', () => {
        hoveredState.node = true;
        this._updateButtonVisibility(node.id);
      });
      nodeView.on('pointerleave', () => {
        hoveredState.node = false;
        this._updateButtonVisibility(node.id);
      });
    } else {
      this._updateButtonVisibility(node.id);
    }

    return collapseButton;
  }

  override onBoxSelected(context: BoxSelectionContext) {
    const { box } = context;
    const bound = new Bound(box.x, box.y, box.w, box.h);

    return bound.contains(this.model.elementBound);
  }

  override onCreated(): void {
    this._setLayoutMethod();
    this._initCollapseButtons();
    this._setVisibleOnSelection();
  }

  override onDestroyed() {
    super.onDestroyed();
    this._collapseButtons.forEach(btn => {
      this.surface.deleteLocalElement(btn);
    });
  }
}

export const MindMapInteraction = GfxViewInteractionExtension<MindMapView>(
  MindMapView.type,
  {
    resizeConstraint: {
      allowedHandlers: [],
    },
    handleSelection: () => {
      return {
        onSelect(context) {
          const { model } = context;

          if (model.isLocked()) {
            return context.default(context);
          }

          return false;
        },
      };
    },
  }
);
