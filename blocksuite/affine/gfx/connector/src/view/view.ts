import {
  type ConnectorElementModel,
  LocalShapeElementModel,
} from '@blocksuite/affine-model';
import { Bound, serializeXYWH, Vec } from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import {
  type DragEndContext,
  type DragMoveContext,
  type DragStartContext,
  generateKeyBetween,
  GfxElementModelView,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

import { mountConnectorLabelEditor } from '../text/edgeless-connector-label-editor';

export class ConnectorElementView extends GfxElementModelView<ConnectorElementModel> {
  static override type = 'connector';

  override onDragStart = (context: DragStartContext) => {
    super.onDragStart(context);
    this.model.stash('labelXYWH');
  };

  override onDragEnd = (context: DragEndContext) => {
    super.onDragEnd(context);
    this.model.stash('labelXYWH');
  };

  override onDragMove = (context: DragMoveContext) => {
    const { dx, dy, currentBound } = context;

    this.model.moveTo(currentBound.moveDelta(dx, dy));
  };

  override onCreated(): void {
    super.onCreated();

    this._initLabelMoving();
  }

  private _initLabelMoving(): void {
    let curLabelElement: LocalShapeElementModel | null = null;

    if (this.model.isLocked()) {
      return;
    }

    const enterLabelEditor = (evt: PointerEventState) => {
      const edgeless = this.std.view.getBlock(this.std.store.root!.id);

      if (edgeless && !this.model.isLocked()) {
        mountConnectorLabelEditor(
          this.model,
          edgeless,
          this.gfx.viewport.toModelCoord(evt.x, evt.y)
        );
      }
    };
    const getCurrentPosition = (evt: PointerEventState) => {
      const [x, y] = this.gfx.viewport.toModelCoord(evt.x, evt.y);
      return {
        x,
        y,
        clientX: evt.raw.clientX,
        clientY: evt.raw.clientY,
      };
    };
    const watchEvent = (labelModel: LocalShapeElementModel) => {
      const view = this.gfx.view.get(labelModel) as GfxElementModelView;
      const connectorModel = this.model;

      let labelBound: Bound | null = null;
      let startPoint = {
        x: 0,
        y: 0,
        clientX: 0,
        clientY: 0,
      };
      let lastPoint = {
        x: 0,
        y: 0,
        clientX: 0,
        clientY: 0,
      };

      view.on('dblclick', evt => {
        enterLabelEditor(evt);
      });
      view.on('dragstart', evt => {
        startPoint = getCurrentPosition(evt);
        labelBound = Bound.deserialize(labelModel.xywh);

        connectorModel.stash('labelXYWH');
        connectorModel.stash('labelOffset');
      });

      view.on('dragmove', evt => {
        if (!labelBound) {
          return;
        }

        lastPoint = getCurrentPosition(evt);
        const newBound = labelBound.clone();
        const delta = [lastPoint.x - startPoint.x, lastPoint.y - startPoint.y];
        const center = connectorModel.getNearestPoint(
          Vec.add(newBound.center, delta)
        );
        const distance = connectorModel.getOffsetDistanceByPoint(center);
        newBound.center = center;

        connectorModel.labelXYWH = newBound.toXYWH();
        connectorModel.labelOffset = {
          distance,
        };
      });

      view.on('dragend', () => {
        if (labelBound) {
          labelBound = null;
          connectorModel.pop('labelXYWH');
          connectorModel.pop('labelOffset');
        }
      });
    };
    const updateLabelElement = () => {
      if (!this.model.labelXYWH || !this.model.text) {
        // Clean up existing label element if conditions are no longer met
        if (curLabelElement) {
          this.surface.deleteLocalElement(curLabelElement);
          curLabelElement = null;
        }
        return;
      }

      const labelElement =
        curLabelElement || new LocalShapeElementModel(this.surface);
      labelElement.xywh = serializeXYWH(...this.model.labelXYWH);
      labelElement.index = generateKeyBetween(this.model.index, null);

      if (!curLabelElement) {
        curLabelElement = labelElement;

        labelElement.id = `#${this.model.id}-label`;
        labelElement.creator = this.model;
        labelElement.fillColor = 'transparent';
        labelElement.strokeColor = 'transparent';
        labelElement.strokeWidth = 0;

        this.surface.addLocalElement(labelElement);
        this.disposable.add(() => {
          this.surface.deleteLocalElement(labelElement);
        });
        watchEvent(labelElement);
      }
    };

    this.disposable.add(
      this.model.propsUpdated.subscribe(payload => {
        if (
          payload.key === 'labelXYWH' ||
          payload.key === 'text' ||
          payload.key === 'index'
        ) {
          updateLabelElement();
        }
      })
    );

    updateLabelElement();

    this.on('dblclick', evt => {
      if (!curLabelElement) {
        enterLabelEditor(evt);
      }
    });
  }
}

export const ConnectorInteraction =
  GfxViewInteractionExtension<ConnectorElementView>(ConnectorElementView.type, {
    handleResize: ({ model, gfx }) => {
      const initialPath = model.absolutePath;

      return {
        beforeResize(context): void {
          const { elements } = context;
          // show the handles only when connector is selected along with
          // its source and target elements
          if (
            elements.length === 1 ||
            (model.source.id &&
              !elements.some(el => el.model.id === model.source.id)) ||
            (model.target.id &&
              !elements.some(el => el.model.id === model.target.id))
          ) {
            context.set({
              allowedHandlers: [],
            });
          }
        },

        onResizeStart(): void {
          model.stash('labelXYWH');
          model.stash('source');
          model.stash('target');
        },

        onResizeMove(context): void {
          const { matrix } = context;
          const props = model.resize(initialPath, matrix);

          gfx.updateElement(model, props);
        },

        onResizeEnd(): void {
          model.pop('labelXYWH');
          model.pop('source');
          model.pop('target');
        },
      };
    },
    handleRotate({ model, gfx }) {
      const initialPath = model.absolutePath;

      return {
        onRotateStart(): void {
          model.stash('labelXYWH');
          model.stash('source');
          model.stash('target');
        },

        onRotateMove(context): void {
          const { matrix } = context;
          const props = model.resize(initialPath, matrix);

          gfx.updateElement(model, props);
        },

        onRotateEnd(): void {
          model.pop('labelXYWH');
          model.pop('source');
          model.pop('target');
        },
      };
    },
  });
