import { type ServiceIdentifier } from '@blocksuite/global/di';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { Bound, clamp, Point } from '@blocksuite/global/gfx';
import { signal } from '@preact/signals-core';
import last from 'lodash-es/last.js';

import type { PointerEventState } from '../../event/state/pointer.js';
import { getTopElements } from '../../utils/tree.js';
import type { GfxBlockComponent } from '../../view/index.js';
import { GfxExtension, GfxExtensionIdentifier } from '../extension.js';
import { GfxBlockElementModel } from '../model/gfx-block-model.js';
import type { GfxModel } from '../model/model.js';
import { GfxPrimitiveElementModel } from '../model/surface/element-model.js';
import type { GfxElementModelView } from '../view/view.js';
import { createInteractionContext, type SupportedEvents } from './event.js';
import {
  type ActionContextMap,
  type InteractivityActionAPI,
  type InteractivityEventAPI,
  InteractivityExtensionIdentifier,
} from './extension/base.js';
import {
  type GfxViewInteractionConfig,
  GfxViewInteractionIdentifier,
} from './extension/view.js';
import { GfxViewEventManager } from './gfx-view-event-handler.js';
import {
  DEFAULT_HANDLES,
  type OptionResize,
  ResizeController,
  type ResizeHandle,
  type RotateOption,
} from './resize/manager.js';
import type { RequestElementsCloneContext } from './types/clone.js';
import type {
  DragExtensionInitializeContext,
  DragInitializationOption,
  ExtensionDragEndContext,
  ExtensionDragMoveContext,
  ExtensionDragStartContext,
} from './types/drag.js';
import type {
  BoxSelectionContext,
  ResizeConstraint,
  RotateConstraint,
  SelectContext,
} from './types/view.js';

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

  activeInteraction$ = signal<null | {
    type: 'move' | 'resize' | 'rotate';
    elements: GfxModel[];
  } | null>(null);

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
    if (this.activeInteraction$.peek()) {
      return;
    }

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

  private _getSelectionConfig(models: GfxModel[]) {
    type SelectionHandlers = Required<
      ReturnType<Required<GfxViewInteractionConfig>['handleSelection']>
    >;

    const selectionConfigMap = new Map<
      string,
      {
        view: GfxBlockComponent | GfxElementModelView;
        handlers: SelectionHandlers;
        defaultHandlers: SelectionHandlers;
      }
    >();

    models.forEach(model => {
      const typeOrFlavour = 'flavour' in model ? model.flavour : model.type;
      const view = this.gfx.view.get(model);
      const config = this.std.getOptional(
        GfxViewInteractionIdentifier(typeOrFlavour)
      );

      if (!view) {
        return;
      }

      const selectionConfig =
        config?.handleSelection?.({
          gfx: this.gfx,
          std: this.std,
          view,
          model,
        }) ?? {};
      const defaultHandlers = {
        selectable: () => {
          return !model.isLockedByAncestor();
        },
        onSelect: (context: SelectContext) => {
          if (context.multiSelect) {
            this.gfx.selection.toggle(model);
          } else {
            this.gfx.selection.set({ elements: [model.id] });
          }

          return true;
        },
      };

      selectionConfigMap.set(model.id, {
        view,
        defaultHandlers,
        handlers: {
          ...defaultHandlers,
          ...selectionConfig,
        },
      });
    });

    return selectionConfigMap;
  }

  private _getSuggestedTarget(context: {
    candidates: GfxModel[];
    target: GfxModel;
  }) {
    const { candidates, target } = context;

    const suggestedElements: {
      id: string;
      priority?: number;
    }[] = [];
    const suggest = (element: { id: string; priority?: number }) => {
      suggestedElements.push(element);
    };

    const extensions = this.interactExtensions;
    extensions
      .values()
      .toArray()
      .forEach(ext => {
        return (ext.action as InteractivityActionAPI).emit('elementSelect', {
          candidates,
          target,
          suggest,
        });
      });

    if (suggestedElements.length) {
      suggestedElements.sort((a, b) => {
        return (a.priority ?? 0) - (b.priority ?? 0);
      });

      const suggested = last(suggestedElements) as {
        id: string;
        priority?: number;
      };
      const elm = this.gfx.getElementById(suggested.id);

      return elm instanceof GfxPrimitiveElementModel ||
        elm instanceof GfxBlockElementModel
        ? elm
        : target;
    }

    return target;
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
    let candidates = this.gfx.getElementByPoint(x, y, {
      all: true,
    });

    const selectionConfigs = this._getSelectionConfig(candidates);
    const context = {
      multiSelect: raw.shiftKey,
      event: raw,
      position: Point.from([x, y]),
    };

    candidates = candidates.filter(model => {
      if (!selectionConfigs.has(model.id)) {
        return false;
      }
      const config = selectionConfigs.get(model.id)!;

      return (
        selectionConfigs.has(model.id) &&
        selectionConfigs.get(model.id)?.handlers.selectable({
          ...context,
          view: config.view,
          model,
          default: config.defaultHandlers.selectable as () => boolean,
        })
      );
    });

    {
      let target = last(candidates);

      if (!target) {
        return false;
      }

      target = this._getSuggestedTarget({
        candidates,
        target,
      });

      const config = selectionConfigs.has(target.id)
        ? selectionConfigs.get(target.id)
        : this._getSelectionConfig([target]).get(target.id);

      if (!config) {
        return false;
      }

      const multiSelect = raw.shiftKey;
      const context = {
        selected: multiSelect ? !gfx.selection.has(target.id) : true,
        multiSelect,
        event: raw,
        position: Point.from([x, y]),
      };

      const result = config.handlers.onSelect({
        ...context,
        selected: multiSelect ? !gfx.selection.has(target.id) : true,
        view: config.view,
        model: target,
        default: config.defaultHandlers.onSelect as () => void,
      });

      return result ?? true;
    }
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
      this.activeInteraction$.value = null;

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
      this.activeInteraction$.value = {
        type: 'move',
        elements: context.elements,
      };

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

  handleElementRotate(
    options: Omit<
      RotateOption,
      'onRotateStart' | 'onRotateEnd' | 'onRotateUpdate'
    > & {
      onRotateUpdate?: (payload: {
        currentAngle: number;
        delta: number;
      }) => void;
      onRotateStart?: () => void;
      onRotateEnd?: () => void;
    }
  ) {
    const { rotatable, viewConfigMap, initialRotate } =
      this._getViewRotateConfig(options.elements);

    if (!rotatable) {
      return;
    }

    const handler = new ResizeController({ gfx: this.gfx });
    const elements = Array.from(viewConfigMap.values()).map(
      config => config.view.model
    ) as GfxModel[];

    handler.startRotate({
      ...options,
      elements,
      onRotateStart: payload => {
        this.activeInteraction$.value = {
          type: 'rotate',
          elements,
        };
        options.onRotateStart?.();
        payload.data.forEach(({ model }) => {
          if (!viewConfigMap.has(model.id)) {
            return;
          }

          const { handlers, defaultHandlers, view, constraint } =
            viewConfigMap.get(model.id)!;

          handlers.onRotateStart({
            default: defaultHandlers.onRotateStart as () => void,
            constraint,
            model,
            view,
          });
        });
      },
      onRotateUpdate: payload => {
        options.onRotateUpdate?.({
          currentAngle: initialRotate + payload.delta,
          delta: payload.delta,
        });
        payload.data.forEach(
          ({
            model,
            newBound,
            originalBound,
            newRotate,
            originalRotate,
            matrix,
          }) => {
            if (!viewConfigMap.has(model.id)) {
              return;
            }

            const { handlers, defaultHandlers, view, constraint } =
              viewConfigMap.get(model.id)!;

            handlers.onRotateMove({
              model,
              newBound,
              originalBound,
              newRotate,
              originalRotate,
              default: defaultHandlers.onRotateMove as () => void,
              constraint,
              view,
              matrix,
            });
          }
        );
      },
      onRotateEnd: payload => {
        this.activeInteraction$.value = null;
        options.onRotateEnd?.();
        this.std.store.transact(() => {
          payload.data.forEach(({ model }) => {
            if (!viewConfigMap.has(model.id)) {
              return;
            }

            const { handlers, defaultHandlers, view, constraint } =
              viewConfigMap.get(model.id)!;

            handlers.onRotateEnd({
              default: defaultHandlers.onRotateEnd as () => void,
              view,
              model,
              constraint,
            });
          });
        });
      },
    });
  }

  private _getViewRotateConfig(elements: GfxModel[]) {
    const deleted = new Set<GfxModel>();
    const added = new Set<GfxModel>();
    const del = (model: GfxModel) => {
      deleted.add(model);
    };
    const add = (model: GfxModel) => {
      added.add(model);
    };

    type ViewRotateHandlers = Required<
      ReturnType<Required<GfxViewInteractionConfig>['handleRotate']>
    >;

    const viewConfigMap = new Map<
      string,
      {
        model: GfxModel;
        view: GfxElementModelView | GfxBlockComponent;
        handlers: ViewRotateHandlers;
        defaultHandlers: ViewRotateHandlers;
        constraint: Required<RotateConstraint>;
      }
    >();

    const addToConfigMap = (model: GfxModel) => {
      const flavourOrType = 'type' in model ? model.type : model.flavour;
      const interactionConfig = this.std.getOptional(
        GfxViewInteractionIdentifier(flavourOrType)
      );
      const view = this.gfx.view.get(model);

      if (!view) {
        return;
      }

      const defaultHandlers: ViewRotateHandlers = {
        beforeRotate: () => {},
        onRotateStart: context => {
          if (!context.constraint.rotatable) {
            return;
          }

          if (model instanceof GfxBlockElementModel) {
            if (Object.hasOwn(model.props, 'rotate')) {
              // @ts-expect-error prop existence has been checked
              model.stash('rotate');
              model.stash('xywh');
            }
          } else {
            model.stash('rotate');
            model.stash('xywh');
          }
        },
        onRotateEnd: context => {
          if (!context.constraint.rotatable) {
            return;
          }

          if (model instanceof GfxBlockElementModel) {
            if (Object.hasOwn(model.props, 'rotate')) {
              // @ts-expect-error prop existence has been checked
              model.pop('rotate');
              model.pop('xywh');
            }
          } else {
            model.pop('rotate');
            model.pop('xywh');
          }
        },
        onRotateMove: context => {
          if (!context.constraint.rotatable) {
            return;
          }

          const { newBound, newRotate } = context;
          model.rotate = newRotate;
          model.xywh = newBound.serialize();
        },
      };
      const handlers = interactionConfig?.handleRotate?.({
        std: this.std,
        gfx: this.gfx,
        view,
        model,
        delete: del,
        add,
      });

      viewConfigMap.set(model.id, {
        model,
        view,
        defaultHandlers,
        handlers: Object.assign({}, defaultHandlers, handlers ?? {}),
        constraint: {
          rotatable: true,
        },
      });
    };

    elements.forEach(addToConfigMap);

    deleted.forEach(model => {
      if (viewConfigMap.has(model.id)) {
        viewConfigMap.delete(model.id);
      }
    });

    added.forEach(model => {
      if (viewConfigMap.has(model.id)) {
        return;
      }

      addToConfigMap(model);
    });

    const views = Array.from(viewConfigMap.values().map(item => item.view));

    let rotatable = true;
    viewConfigMap.forEach(config => {
      const handlers = config.handlers;

      handlers.beforeRotate({
        set: (newConstraint: RotateConstraint) => {
          Object.assign(config.constraint, newConstraint);
          rotatable = rotatable && config.constraint.rotatable;
        },
        elements: views,
      });
    });

    return {
      initialRotate: views.length > 1 ? 0 : (views[0]?.model.rotate ?? 0),
      rotatable,
      viewConfigMap,
    };
  }

  private _getViewResizeConfig(elements: GfxModel[]) {
    const deleted = new Set<GfxModel>();
    const added = new Set<GfxModel>();
    const del = (model: GfxModel) => {
      deleted.add(model);
    };
    const add = (model: GfxModel) => {
      added.add(model);
    };

    type ViewResizeHandlers = Required<
      ReturnType<Required<GfxViewInteractionConfig>['handleResize']>
    >;

    const viewConfigMap = new Map<
      string,
      {
        model: GfxModel;
        view: GfxElementModelView | GfxBlockComponent;
        constraint: Required<ResizeConstraint>;
        handlers: ViewResizeHandlers;
        defaultHandlers: ViewResizeHandlers;
      }
    >();
    const addToConfigMap = (model: GfxModel) => {
      const flavourOrType = 'type' in model ? model.type : model.flavour;
      const interactionConfig = this.std.getOptional(
        GfxViewInteractionIdentifier(flavourOrType)
      );
      const view = this.gfx.view.get(model);

      if (!view) {
        return;
      }

      const defaultHandlers: ViewResizeHandlers = {
        beforeResize: () => {},
        onResizeStart: () => {
          model.stash('xywh');
        },
        onResizeEnd: () => {
          model.pop('xywh');
        },
        onResizeMove: context => {
          const { newBound, constraint } = context;
          const { minWidth, minHeight, maxWidth, maxHeight } = constraint;

          newBound.w = clamp(newBound.w, minWidth, maxWidth);
          newBound.h = clamp(newBound.h, minHeight, maxHeight);

          model.xywh = newBound.serialize();
        },
      };
      const handlers = interactionConfig?.handleResize?.({
        std: this.std,
        gfx: this.gfx,
        view,
        model,
        delete: del,
        add,
      });

      viewConfigMap.set(model.id, {
        model,
        view,
        constraint: {
          lockRatio: false,
          allowedHandlers: DEFAULT_HANDLES,
          minHeight: 2,
          minWidth: 2,
          maxHeight: 5000000,
          maxWidth: 5000000,
          ...interactionConfig?.resizeConstraint,
        },
        defaultHandlers,
        handlers: Object.assign({}, defaultHandlers, handlers ?? {}),
      });
    };

    elements.forEach(addToConfigMap);

    deleted.forEach(model => {
      if (viewConfigMap.has(model.id)) {
        viewConfigMap.delete(model.id);
      }
    });

    added.forEach(model => {
      if (viewConfigMap.has(model.id)) {
        return;
      }

      addToConfigMap(model);
    });

    const views = Array.from(viewConfigMap.values().map(item => item.view));
    let allowedHandlers = new Set(DEFAULT_HANDLES);

    viewConfigMap.forEach(config => {
      const currConstraint: Required<ResizeConstraint> = config.constraint;

      config.handlers.beforeResize({
        set: (newConstraint: ResizeConstraint) => {
          Object.assign(currConstraint, newConstraint);
        },
        elements: views,
      });

      config.constraint = currConstraint;

      const currentAllowedHandlers = new Set(currConstraint.allowedHandlers);
      allowedHandlers.forEach(h => {
        if (!currentAllowedHandlers.has(h)) {
          allowedHandlers.delete(h);
        }
      });
    });

    return {
      allowedHandlers: Array.from(allowedHandlers) as ResizeHandle[],
      viewConfigMap,
    };
  }

  getRotateConfig(options: { elements: GfxModel[] }) {
    return this._getViewRotateConfig(options.elements);
  }

  getResizeHandlers(options: { elements: GfxModel[] }) {
    return this._getViewResizeConfig(options.elements).allowedHandlers;
  }

  handleElementResize(
    options: Omit<
      OptionResize,
      | 'lockRatio'
      | 'onResizeStart'
      | 'onResizeEnd'
      | 'onResizeUpdate'
      | 'onResizeMove'
    > & {
      onResizeStart?: () => void;
      onResizeEnd?: () => void;
      onResizeUpdate?: (payload: {
        lockRatio: boolean;
        scaleX: number;
        scaleY: number;
        exceed: {
          w: boolean;
          h: boolean;
        };
      }) => void;
    }
  ) {
    const { viewConfigMap, allowedHandlers } = this._getViewResizeConfig(
      options.elements
    );

    if (!allowedHandlers.includes(options.handle)) {
      return;
    }

    const { handle } = options;
    const controller = new ResizeController({ gfx: this.gfx });
    const elements = Array.from(viewConfigMap.values()).map(
      config => config.view.model
    ) as GfxModel[];
    const extensionHandlers = this.interactExtensions.values().reduce(
      (handlers, ext) => {
        const extHandlers = (ext.action as InteractivityActionAPI).emit(
          'elementResize',
          {
            elements,
          }
        );

        if (extHandlers) {
          handlers.push(extHandlers);
        }

        return handlers;
      },
      [] as ActionContextMap['elementResize']['returnType'][]
    );
    let lockRatio = false;

    viewConfigMap.forEach(config => {
      const { lockRatio: lockRatioConfig } = config.constraint;

      lockRatio =
        lockRatio ||
        lockRatioConfig === true ||
        (Array.isArray(lockRatioConfig) && lockRatioConfig.includes(handle));
    });

    controller.startResize({
      ...options,
      lockRatio,
      elements,
      onResizeMove: ({
        scaleX,
        scaleY,
        originalBound,
        handleSign,
        handlePos,
        currentHandlePos,
        lockRatio,
      }) => {
        const suggested: {
          scaleX: number;
          scaleY: number;
          priority?: number;
        }[] = [];
        const suggest = (distance: { scaleX: number; scaleY: number }) => {
          suggested.push(distance);
        };

        extensionHandlers.forEach(ext => {
          ext.onResizeMove?.({
            scaleX,
            scaleY,
            elements,
            handle,
            handleSign,
            handlePos,
            originalBound,
            currentHandlePos,
            lockRatio,
            suggest,
          });
        });

        suggested.sort((a, b) => {
          return (a.priority ?? 0) - (b.priority ?? 0);
        });

        return last(suggested) ?? { scaleX, scaleY };
      },
      onResizeStart: ({ handleSign, handlePos, data }) => {
        this.activeInteraction$.value = {
          type: 'resize',
          elements,
        };
        extensionHandlers.forEach(ext => {
          ext.onResizeStart?.({
            elements,
            handle,
            handlePos,
            handleSign,
          });
        });

        options.onResizeStart?.();
        data.forEach(({ model }) => {
          if (!viewConfigMap.has(model.id)) {
            return;
          }

          const { handlers, defaultHandlers, view, constraint } =
            viewConfigMap.get(model.id)!;

          handlers.onResizeStart({
            handle,
            default: defaultHandlers.onResizeStart as () => void,
            constraint,
            model,
            view,
          });
        });
      },
      onResizeUpdate: ({ data, scaleX, scaleY, lockRatio }) => {
        const exceed = {
          w: false,
          h: false,
        };

        data.forEach(
          ({ model, newBound, originalBound, lockRatio, matrix }) => {
            if (!viewConfigMap.has(model.id)) {
              return;
            }

            const { handlers, defaultHandlers, view, constraint } =
              viewConfigMap.get(model.id)!;

            handlers.onResizeMove({
              model,
              newBound,
              originalBound,
              handle,
              default: defaultHandlers.onResizeMove as () => void,
              constraint,
              view,
              lockRatio,
              matrix,
            });

            exceed.w =
              exceed.w ||
              model.w === constraint.minWidth ||
              model.w === constraint.maxWidth;
            exceed.h =
              exceed.h ||
              model.h === constraint.minHeight ||
              model.h === constraint.maxHeight;
          }
        );

        options.onResizeUpdate?.({ scaleX, scaleY, lockRatio, exceed });
      },
      onResizeEnd: ({ handleSign, handlePos, data }) => {
        this.activeInteraction$.value = null;

        extensionHandlers.forEach(ext => {
          ext.onResizeEnd?.({
            elements,
            handle,
            handlePos,
            handleSign,
          });
        });
        options.onResizeEnd?.();
        this.std.store.transact(() => {
          data.forEach(({ model }) => {
            if (!viewConfigMap.has(model.id)) {
              return;
            }

            const { handlers, defaultHandlers, view, constraint } =
              viewConfigMap.get(model.id)!;

            handlers.onResizeEnd({
              default: defaultHandlers.onResizeEnd as () => void,
              view,
              model,
              constraint,
              handle,
            });
          });
        });
      },
    });
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
