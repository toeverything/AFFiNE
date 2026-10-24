import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

type ActivateEvent =
  | ReactMouseEvent<Element>
  | ReactPointerEvent<Element>
  | MouseEvent
  | PointerEvent;

export type PenDownPoint = {
  pointerId: number;
  x: number;
  y: number;
};

// ~10px — Pencil taps routinely jitter a few px between down/up on iPad.
export const PEN_TAP_SLOP_SQ = 100;

export function isWithinPenTapSlop(
  down: Pick<PenDownPoint, 'x' | 'y'>,
  up: Pick<PointerEvent, 'clientX' | 'clientY'>
): boolean {
  const dx = up.clientX - down.x;
  const dy = up.clientY - down.y;
  return dx * dx + dy * dy <= PEN_TAP_SLOP_SQ;
}

/**
 * Apple Pencil taps inside WKWebView modal/dialog surfaces often skip the
 * synthesized `click` (micro-movement between down/up cancels it). Activate on
 * a pen `pointerup` that stayed within slop of its `pointerdown`, and suppress
 * a trailing `click` if the browser does synthesize one.
 *
 * Do not require `button === 0`: WKWebView Pencil `pointerup` can report
 * `button: -1` even for a real tip lift.
 */
export function createPenClickCompatHandlers(
  activate: (event: ActivateEvent) => void
) {
  let ignoreNextClick = false;
  let penDown: PenDownPoint | null = null;

  return {
    onPointerDown: (event: ReactPointerEvent<Element> | PointerEvent) => {
      if (event.pointerType !== 'pen') {
        return;
      }
      penDown = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    onPointerCancel: () => {
      penDown = null;
    },
    onPointerUp: (event: ReactPointerEvent<Element> | PointerEvent) => {
      if (event.pointerType !== 'pen' || !penDown) {
        return;
      }
      if (event.pointerId !== penDown.pointerId) {
        return;
      }
      const down = penDown;
      penDown = null;
      if (!isWithinPenTapSlop(down, event)) {
        return;
      }
      ignoreNextClick = true;
      activate(event);
      // Clear even when the browser never synthesizes click after pointerup.
      const scheduleClear =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (cb: () => void) => setTimeout(cb, 0);
      scheduleClear(() => {
        ignoreNextClick = false;
      });
    },
    onClick: (event: ReactMouseEvent<Element> | MouseEvent) => {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        return;
      }
      activate(event);
    },
  };
}
