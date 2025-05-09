import type { Palette } from '@blocksuite/affine-model';
import { IS_IOS, IS_MAC } from '@blocksuite/global/env';

export function isTouchPadPinchEvent(e: WheelEvent) {
  // two finger pinches on touch pad, ctrlKey is always true.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=397027
  if (IS_IOS || IS_MAC) {
    return e.ctrlKey || e.metaKey;
  }
  return e.ctrlKey;
}

// See https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
export enum MOUSE_BUTTONS {
  AUXILIARY = 4,
  FIFTH = 16,
  FORTH = 8,
  NO_BUTTON = 0,
  PRIMARY = 1,
  SECONDARY = 2,
}

export enum MOUSE_BUTTON {
  AUXILIARY = 1,
  FIFTH = 4,
  FORTH = 3,
  MAIN = 0,
  SECONDARY = 2,
}

export function isMiddleButtonPressed(e: MouseEvent) {
  return (MOUSE_BUTTONS.AUXILIARY & e.buttons) === MOUSE_BUTTONS.AUXILIARY;
}

export function isRightButtonPressed(e: MouseEvent) {
  return (MOUSE_BUTTONS.SECONDARY & e.buttons) === MOUSE_BUTTONS.SECONDARY;
}

export function stopPropagation(event: Event) {
  event.stopPropagation();
}

export function isControlledKeyboardEvent(e: KeyboardEvent) {
  return e.ctrlKey || e.metaKey || e.altKey;
}

export function isNewTabTrigger(event?: MouseEvent) {
  return event
    ? (event.ctrlKey || event.metaKey || event.button === 1) && !event.altKey
    : false;
}

export function isNewViewTrigger(event?: MouseEvent) {
  return event ? (event.ctrlKey || event.metaKey) && event.altKey : false;
}

export function on<
  T extends HTMLElement,
  K extends keyof M,
  M = HTMLElementEventMap,
>(
  element: T,
  event: K,
  handler: (ev: M[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function on<T extends HTMLElement>(
  element: T,
  event: string,
  handler: (ev: Event) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function on<T extends Document, K extends keyof M, M = DocumentEventMap>(
  element: T,
  event: K,
  handler: (ev: M[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function on<
  T extends HTMLElement | Document,
  K extends keyof HTMLElementEventMap,
>(
  element: T,
  event: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
) {
  const dispose = () => {
    element.removeEventListener(
      event as string,
      handler as unknown as EventListenerObject,
      options
    );
  };

  element.addEventListener(
    event as string,
    handler as unknown as EventListenerObject,
    options
  );

  return dispose;
}

export function once<
  T extends HTMLElement,
  K extends keyof M,
  M = HTMLElementEventMap,
>(
  element: T,
  event: K,
  handler: (ev: M[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function once<T extends HTMLElement>(
  element: T,
  event: string,
  handler: (ev: Event) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function once<
  T extends Document,
  K extends keyof M,
  M = DocumentEventMap,
>(
  element: T,
  event: K,
  handler: (ev: M[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function once<
  T extends HTMLElement,
  K extends keyof HTMLElementEventMap,
>(
  element: T,
  event: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
) {
  const onceHandler = (e: HTMLElementEventMap[K]) => {
    dispose();
    handler(e);
  };
  const dispose = () => {
    element.removeEventListener(event, onceHandler, options);
  };

  element.addEventListener(event, onceHandler, options);

  return dispose;
}

export function delayCallback(callback: () => void, delay: number = 0) {
  const timeoutId = setTimeout(callback, delay);

  return () => clearTimeout(timeoutId);
}

/**
 * A wrapper around `requestAnimationFrame` that only calls the callback if the
 * element is still connected to the DOM.
 */
export function requestConnectedFrame(
  callback: () => void,
  element?: HTMLElement
) {
  return requestAnimationFrame(() => {
    // If element is not provided, fallback to `requestAnimationFrame`
    if (element === undefined) {
      callback();
      return;
    }

    // Only calls callback if element is still connected to the DOM
    if (element.isConnected) callback();
  });
}

/**
 * A wrapper around `requestConnectedFrame` that only calls at most once in one frame
 */
export function requestThrottledConnectedFrame<
  T extends (...args: any[]) => void,
>(func: T, element?: HTMLElement): T {
  let raqId: number | undefined = undefined;
  let latestArgs: unknown[] = [];

  return ((...args: unknown[]) => {
    latestArgs = args;

    if (raqId) return;

    raqId = requestConnectedFrame(() => {
      raqId = undefined;
      func(...latestArgs);
    }, element);
  }) as T;
}

export const captureEventTarget = (target: EventTarget | null) => {
  const isElementOrNode = target instanceof Element || target instanceof Node;
  return isElementOrNode
    ? target instanceof Element
      ? target
      : target.parentElement
    : null;
};

interface ObserverParams {
  target: HTMLElement;
  signal: AbortSignal;
  onInput?: (isComposition: boolean) => void;
  onDelete?: () => void;
  onMove?: (step: 1 | -1) => void;
  onConfirm?: () => void;
  onAbort?: () => void;
  onPaste?: () => void;
  interceptor?: (e: KeyboardEvent, next: () => void) => void;
}

/**
 * @deprecated don't use this, use event dispatch instead
 */
export const createKeydownObserver = ({
  target,
  signal,
  onInput,
  onDelete,
  onMove,
  onConfirm,
  onAbort,
  onPaste,
  interceptor = (_, next) => next(),
}: ObserverParams) => {
  const keyDownListener = (e: KeyboardEvent) => {
    if (e.key === 'Process' || e.isComposing) return;

    if (e.defaultPrevented) return;

    if (isControlledKeyboardEvent(e)) {
      const isOnlyCmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      // Ctrl/Cmd + alphabet key
      if (isOnlyCmd && e.key.length === 1) {
        switch (e.key) {
          // Previous command
          case 'p': {
            onMove?.(-1);
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          // Next command
          case 'n': {
            onMove?.(1);
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          // Paste command
          case 'v': {
            onPaste?.();
            return;
          }
        }
      }

      // Pressing **only** modifier key is allowed and will be ignored
      // Because we don't know the user's intention
      // Aborting here will cause the above hotkeys to not work
      if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt') {
        e.stopPropagation();
        return;
      }

      // Abort when press modifier key + any other key to avoid weird behavior
      // e.g. press ctrl + a to select all
      onAbort?.();
      return;
    }

    e.stopPropagation();

    if (
      // input abc, 123, etc.
      !isControlledKeyboardEvent(e) &&
      e.key.length === 1
    ) {
      onInput?.(false);
      return;
    }

    switch (e.key) {
      case 'Backspace': {
        onDelete?.();
        return;
      }
      case 'Enter': {
        if (e.shiftKey) {
          onAbort?.();
          return;
        }
        onConfirm?.();
        e.preventDefault();
        return;
      }
      case 'Tab': {
        if (e.shiftKey) {
          onMove?.(-1);
        } else {
          onMove?.(1);
        }
        e.preventDefault();
        return;
      }
      case 'ArrowUp': {
        if (e.shiftKey) {
          onAbort?.();
          return;
        }
        onMove?.(-1);
        e.preventDefault();
        return;
      }
      case 'ArrowDown': {
        if (e.shiftKey) {
          onAbort?.();
          return;
        }
        onMove?.(1);
        e.preventDefault();
        return;
      }
      case 'Escape':
      case 'ArrowLeft':
      case 'ArrowRight': {
        onAbort?.();
        return;
      }
      default:
        // Other control keys
        return;
    }
  };

  target.addEventListener(
    'keydown',
    (e: KeyboardEvent) => interceptor(e, () => keyDownListener(e)),
    {
      // Workaround: Use capture to prevent the event from triggering the keyboard bindings action
      capture: true,
      signal,
    }
  );

  // Fix paste input
  target.addEventListener('paste', () => onDelete?.(), { signal });

  // Fix composition input
  target.addEventListener('compositionend', () => onInput?.(true), { signal });
};

export class ColorEvent extends CustomEvent<Palette> {}
