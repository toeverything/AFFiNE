import type { Disposable } from '@blocksuite/global/disposable';
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  offset,
  type Placement,
  type Rect,
  shift,
  size,
} from '@floating-ui/dom';

export function listenClickAway(
  element: HTMLElement,
  onClickAway: () => void
): Disposable {
  const callback = (event: MouseEvent) => {
    const inside = event.composedPath().includes(element);
    if (!inside) {
      onClickAway();
    }
  };

  document.addEventListener('click', callback);

  return {
    dispose: () => {
      document.removeEventListener('click', callback);
    },
  };
}

type Display = 'show' | 'hidden';

const ATTR_SHOW = 'data-show';

export type ButtonPopperOptions = {
  reference: HTMLElement;
  popperElement: HTMLElement;
  stateUpdated?: (state: { display: Display }) => void;
  mainAxis?: number;
  crossAxis?: number;
  allowedPlacements?: Placement[];
  rootBoundary?: Rect | (() => Rect | undefined);
  offsetHeight?: number;
};
/**
 * Using attribute 'data-show' to control popper visibility.
 *
 * ```css
 * selector {
 *   display: none;
 * }
 * selector[data-show] {
 *   display: block;
 * }
 * ```
 */
export function createButtonPopper(options: ButtonPopperOptions) {
  let display: Display = 'hidden';
  let cleanup: (() => void) | void;
  const {
    reference,
    popperElement,
    stateUpdated = () => {},
    mainAxis,
    crossAxis,
    allowedPlacements = ['top', 'bottom'],
    rootBoundary,
    offsetHeight,
  } = options;

  const originMaxHeight = window.getComputedStyle(popperElement).maxHeight;

  function compute() {
    const overflowOptions = {
      rootBoundary:
        typeof rootBoundary === 'function' ? rootBoundary() : rootBoundary,
    };

    computePosition(reference, popperElement, {
      middleware: [
        offset({
          mainAxis: mainAxis ?? 14,
          crossAxis: crossAxis ?? 0,
        }),
        autoPlacement({
          allowedPlacements,
          ...overflowOptions,
        }),
        shift(overflowOptions),
        size({
          ...overflowOptions,
          apply({ availableHeight }) {
            popperElement.style.maxHeight =
              originMaxHeight && originMaxHeight !== 'none'
                ? `min(${originMaxHeight}, ${availableHeight}px)`
                : `${availableHeight - (offsetHeight ?? 0)}px`;
          },
        }),
      ],
    })
      .then(({ x, y }) => {
        Object.assign(popperElement.style, {
          position: 'absolute',
          zIndex: 1,
          left: `${x}px`,
          top: `${y}px`,
        });
      })
      .catch(console.error);
  }

  const show = (force = false) => {
    const displayed = display === 'show';

    if (displayed && !force) return;

    if (!displayed) {
      popperElement.setAttribute(ATTR_SHOW, '');
      display = 'show';
      stateUpdated({ display });
    }

    cleanup?.();
    cleanup = autoUpdate(reference, popperElement, compute, {
      animationFrame: true,
    });
  };

  const hide = () => {
    if (display === 'hidden') return;
    popperElement.removeAttribute(ATTR_SHOW);
    display = 'hidden';
    stateUpdated({ display });
    cleanup?.();
  };

  const toggle = () => {
    if (popperElement.hasAttribute(ATTR_SHOW)) {
      hide();
    } else {
      show();
    }
  };

  const clickAway = listenClickAway(reference, () => hide());

  return {
    get state() {
      return display;
    },
    show,
    hide,
    toggle,
    dispose: () => {
      cleanup?.();
      clickAway.dispose();
    },
  };
}
