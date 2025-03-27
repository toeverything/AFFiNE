import {
  type Container,
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Bound, Point } from '@blocksuite/global/gfx';
import { Extension } from '@blocksuite/store';

import type { PointerEventState } from '../../event/state/pointer.js';
import { type GfxController } from '../controller.js';
import { GfxExtension, GfxExtensionIdentifier } from '../extension.js';
import { GfxControllerIdentifier } from '../identifiers.js';
import type { GfxModel } from '../model/model.js';
import { type SupportedEvent } from '../view/view.js';
import type {
  DragExtensionInitializeContext,
  DragInitializationOption,
  ExtensionDragEndContext,
  ExtensionDragMoveContext,
  ExtensionDragStartContext,
} from './drag.js';
import { CanvasEventHandler } from './extension/canvas-event-handler.js';

type ExtensionPointerHandler = Exclude<
  SupportedEvent,
  'pointerleave' | 'pointerenter'
>;

export const TransformManagerIdentifier = GfxExtensionIdentifier(
  'element-transform-manager'
) as ServiceIdentifier<ElementTransformManager>;

const CAMEL_CASE_MAP: {
  [key in ExtensionPointerHandler]: keyof CanvasEventHandler;
} = {
  click: 'click',
  dblclick: 'dblClick',
  pointerdown: 'pointerDown',
  pointermove: 'pointerMove',
  pointerup: 'pointerUp',
};

export class ElementTransformManager extends GfxExtension {
  static override key = 'element-transform-manager';

  private readonly _disposable = new DisposableGroup();

  private canvasEventHandler = new CanvasEventHandler(this.gfx);

  override mounted(): void {
    this.canvasEventHandler = new CanvasEventHandler(this.gfx);
  }

  override unmounted(): void {
    this._disposable.dispose();
  }

  get transformExtensions() {
    return this.std.provider.getAll(TransformExtensionIdentifier);
  }

  get keyboard() {
    return this.gfx.keyboard;
  }

  private _safeExecute(fn: () => void, errorMessage: string) {
    try {
      fn();
    } catch (e) {
      console.error(errorMessage, e);
    }
  }

  /**
   * Dispatch the event to canvas elements
   * @param eventName
   * @param evt
   */
  dispatch(eventName: ExtensionPointerHandler, evt: PointerEventState) {
    const handlerName = CAMEL_CASE_MAP[eventName];

    this.canvasEventHandler[handlerName](evt);

    const extension = this.transformExtensions;

    extension.forEach(ext => {
      ext[handlerName]?.(evt);
    });
  }

  dispatchOnSelected(evt: PointerEventState) {
    const { raw } = evt;
    const { gfx } = this;
    const [x, y] = gfx.viewport.toModelCoordFromClientCoord([raw.x, raw.y]);
    const picked = this.gfx.getElementInGroup(x, y);

    const tryGetLockedAncestor = (e: GfxModel) => {
      if (e?.isLockedByAncestor()) {
        return e.groups.findLast(group => group.isLocked()) ?? e;
      }
      return e;
    };

    if (picked) {
      const lockedElement = tryGetLockedAncestor(picked);
      const multiSelect = raw.shiftKey;
      const view = gfx.view.get(lockedElement);
      const context = {
        selected: multiSelect ? !gfx.selection.has(picked.id) : true,
        multiSelect,
        event: raw,
        position: Point.from([x, y]),
        fallback: lockedElement !== picked,
      };

      view?.onSelected(context);
      return true;
    }

    return false;
  }

  initializeDrag(options: DragInitializationOption) {
    let cancelledByExt = false;

    const context: DragExtensionInitializeContext = {
      /**
       * The elements that are being dragged
       */
      elements: options.movingElements,

      preventDefault: () => {
        cancelledByExt = true;
      },

      dragStartPos: Point.from(
        this.gfx.viewport.toModelCoordFromClientCoord([
          options.event.x,
          options.event.y,
        ])
      ),
    };
    const extension = this.transformExtensions;
    const activeExtensionHandlers = Array.from(
      extension.values().map(ext => {
        return ext.onDragInitialize(context);
      })
    );

    if (cancelledByExt) {
      activeExtensionHandlers.forEach(handler => handler.clear?.());
      return;
    }

    const host = this.std.host;
    const { event } = options;
    const internal = {
      elements: context.elements.map(model => {
        return {
          view: this.gfx.view.get(model)!,
          originalBound: Bound.deserialize(model.xywh),
          model: model,
        };
      }),
      dragStartPos: Point.from(
        this.gfx.viewport.toModelCoordFromClientCoord([event.x, event.y])
      ),
    };
    let dragLastPos = internal.dragStartPos;
    let lastEvent = event;

    const viewportWatcher = this.gfx.viewport.viewportMoved.subscribe(() => {
      onDragMove(lastEvent as PointerEvent);
    });
    const onDragMove = (event: PointerEvent) => {
      dragLastPos = Point.from(
        this.gfx.viewport.toModelCoordFromClientCoord([event.x, event.y])
      );

      const moveContext: ExtensionDragMoveContext = {
        ...internal,
        event,
        dragLastPos,
        dx: dragLastPos.x - internal.dragStartPos.x,
        dy: dragLastPos.y - internal.dragStartPos.y,
      };

      // If shift key is pressed, restrict the movement to one direction
      if (this.keyboard.shiftKey$.peek()) {
        const angle = Math.abs(Math.atan2(moveContext.dy, moveContext.dx));
        const direction =
          angle < Math.PI / 4 || angle > 3 * (Math.PI / 4) ? 'dy' : 'dx';

        moveContext[direction] = 0;
      }

      this._safeExecute(() => {
        activeExtensionHandlers.forEach(handler =>
          handler.onDragMove?.(moveContext)
        );
      }, 'Error while executing extension `onDragMove`');

      internal.elements.forEach(element => {
        const { view, originalBound } = element;

        view.onDragMove({
          currentBound: originalBound,
          dx: moveContext.dx,
          dy: moveContext.dy,
          elements: internal.elements,
        });
      });
    };
    const onDragEnd = (event: PointerEvent) => {
      host.removeEventListener('pointermove', onDragMove, false);
      host.removeEventListener('pointerup', onDragEnd, false);
      viewportWatcher.unsubscribe();

      dragLastPos = Point.from(
        this.gfx.viewport.toModelCoordFromClientCoord([event.x, event.y])
      );
      const endContext: ExtensionDragEndContext = {
        ...internal,
        event,
        dragLastPos,
        dx: dragLastPos.x - internal.dragStartPos.x,
        dy: dragLastPos.y - internal.dragStartPos.y,
      };

      this._safeExecute(() => {
        activeExtensionHandlers.forEach(handler =>
          handler.onDragEnd?.(endContext)
        );
      }, 'Error while executing extension `onDragEnd` handler');

      this.std.store.transact(() => {
        internal.elements.forEach(element => {
          const { view, originalBound } = element;

          view.onDragEnd({
            currentBound: originalBound.moveDelta(endContext.dx, endContext.dy),
            dx: endContext.dx,
            dy: endContext.dy,
            elements: internal.elements,
          });
        });
      });

      this._safeExecute(() => {
        activeExtensionHandlers.forEach(handler => handler.clear?.());
      }, 'Error while executing extension `clear` handler');

      options.onDragEnd?.();
    };
    const listenEvent = () => {
      host.addEventListener('pointermove', onDragMove, false);
      host.addEventListener('pointerup', onDragEnd, false);
    };
    const dragStart = () => {
      internal.elements.forEach(({ view, originalBound }) => {
        view.onDragStart({
          currentBound: originalBound,
          elements: internal.elements,
        });
      });

      const dragStartContext: ExtensionDragStartContext = {
        ...internal,
        event: event as PointerEvent,
        dragLastPos,
      };

      this._safeExecute(() => {
        activeExtensionHandlers.forEach(handler =>
          handler.onDragStart?.(dragStartContext)
        );
      }, 'Error while executing extension `onDragStart` handler');
    };

    listenEvent();
    dragStart();
  }
}

export const TransformExtensionIdentifier =
  createIdentifier<TransformExtension>('element-transform-extension');

export class TransformExtension extends Extension {
  static key: string;

  get std() {
    return this.gfx.std;
  }

  constructor(protected readonly gfx: GfxController) {
    super();
  }

  mounted() {}

  unmounted() {}

  click(_: PointerEventState) {}

  dblClick(_: PointerEventState) {}

  pointerDown(_: PointerEventState) {}

  pointerMove(_: PointerEventState) {}

  pointerUp(_: PointerEventState) {}

  onDragInitialize(_: DragExtensionInitializeContext): {
    onDragStart?: (context: ExtensionDragStartContext) => void;
    onDragMove?: (context: ExtensionDragMoveContext) => void;
    onDragEnd?: (context: ExtensionDragEndContext) => void;
    clear?: () => void;
  } {
    return {};
  }

  static override setup(di: Container) {
    if (!this.key) {
      throw new BlockSuiteError(
        ErrorCode.ValueNotExists,
        'key is not defined in the TransformExtension'
      );
    }

    di.add(
      this as unknown as { new (gfx: GfxController): TransformExtension },
      [GfxControllerIdentifier]
    );
    di.addImpl(TransformExtensionIdentifier(this.key), provider =>
      provider.get(this)
    );
  }
}
