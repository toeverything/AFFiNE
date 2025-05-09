import { type ServiceIdentifier } from '@blocksuite/global/di';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { Bound, Point } from '@blocksuite/global/gfx';

import type { PointerEventState } from '../../event/state/pointer.js';
import { getTopElements } from '../../utils/tree.js';
import { GfxExtension, GfxExtensionIdentifier } from '../extension.js';
import type { GfxModel } from '../model/model.js';
import { createInteractionContext, type SupportedEvents } from './event.js';
import {
  type InteractivityActionAPI,
  type InteractivityEventAPI,
  InteractivityExtensionIdentifier,
} from './extension/base.js';
import { GfxViewEventManager } from './gfx-view-event-handler.js';
import type { RequestElementsCloneContext } from './types/clone.js';
import type {
  DragExtensionInitializeContext,
  DragInitializationOption,
  ExtensionDragEndContext,
  ExtensionDragMoveContext,
  ExtensionDragStartContext,
} from './types/drag.js';
import type { BoxSelectionContext } from './types/view.js';

type ExtensionPointerHandler = Exclude<
  SupportedEvents,
  'pointerleave' | 'pointerenter'
>;

export const InteractivityIdentifier = GfxExtensionIdentifier(
  'interactivity-manager'
) as ServiceIdentifier<InteractivityManager>;

export class InteractivityManager extends GfxExtension {
  static override key = 'interactivity-manager';

  private readonly _disposable = new DisposableGroup();

  private canvasEventHandler = new GfxViewEventManager(this.gfx);

  override mounted(): void {
    this.canvasEventHandler = new GfxViewEventManager(this.gfx);
    this.interactExtensions.forEach(ext => {
      ext.mounted();
    });
  }

  override unmounted(): void {
    this._disposable.dispose();
    this.interactExtensions.forEach(ext => {
      ext.unmounted();
    });
  }

  get interactExtensions() {
    return this.std.provider.getAll(InteractivityExtensionIdentifier);
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
   * Dispatch event to extensions and gfx view.
   * @param eventName
   * @param evt
   * @returns
   */
  dispatchEvent(eventName: ExtensionPointerHandler, evt: PointerEventState) {
    const { context, preventDefaultState } = createInteractionContext(evt);
    const extensions = this.interactExtensions;

    extensions.forEach(ext => {
      (ext.event as InteractivityEventAPI).emit(eventName, context);
    });

    const handledByView =
      this.canvasEventHandler.dispatch(eventName, evt) ?? false;

    return {
      preventDefaultState,
      handledByView,
    };
  }

  /**
   * Handle element selection.
   * @param evt The pointer event that triggered the selection.
   * @returns True if the element was selected, false otherwise.
   */
  handleElementSelection(evt: PointerEventState) {
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

      const selected = view?.onSelected(context);
      return selected ?? true;
    }

    return false;
  }

  handleBoxSelection(context: { box: BoxSelectionContext['box'] }) {
    const elements = this.gfx.getElementsByBound(context.box).filter(model => {
      const view = this.gfx.view.get(model);

      if (
        !view ||
        view.onBoxSelected({
          box: context.box,
        }) === false
      )
        return false;

      return true;
    });

    return getTopElements(elements).filter(elm => !elm.isLocked());
  }

  /**
   * Initialize elements movements.
   * It will handle drag start, move and end events automatically.
   * Note: Call this when mouse is already down.
   */
  handleElementMove(options: DragInitializationOption) {
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
    const extension = this.interactExtensions;
    const activeExtensionHandlers = Array.from(
      extension.values().map(ext => {
        return (ext.action as InteractivityActionAPI).emit(
          'dragInitialize',
          context
        );
      })
    );

    if (cancelledByExt) {
      activeExtensionHandlers.forEach(handler => handler?.clear?.());
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
          handler?.onDragMove?.(moveContext)
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
          handler?.onDragEnd?.(endContext)
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
        activeExtensionHandlers.forEach(handler => handler?.clear?.());
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
          handler?.onDragStart?.(dragStartContext)
        );
      }, 'Error while executing extension `onDragStart` handler');
    };

    listenEvent();
    dragStart();
  }

  requestElementClone(options: RequestElementsCloneContext) {
    const extensions = this.interactExtensions;

    for (let ext of extensions.values()) {
      const cloneData = (ext.action as InteractivityActionAPI).emit(
        'elementsClone',
        options
      );

      if (cloneData) {
        return cloneData;
      }
    }

    return Promise.resolve(undefined);
  }
}
