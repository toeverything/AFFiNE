import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

type ActivateEvent =
  | ReactMouseEvent<Element>
  | ReactPointerEvent<Element>
  | MouseEvent
  | PointerEvent;

type PenDown = {
  pointerId: number;
  x: number;
  y: number;
};

// ~10px — Pencil taps routinely jitter a few px between down/up on iPad.
const PEN_TAP_SLOP_SQ = 100;

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
  let penDown: PenDown | null = null;

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
      const dx = event.clientX - penDown.x;
      const dy = event.clientY - penDown.y;
      penDown = null;
      if (dx * dx + dy * dy > PEN_TAP_SLOP_SQ) {
        return;
      }
      ignoreNextClick = true;
      activate(event);
      // Clear even when the browser never synthesizes click after pointerup.
      requestAnimationFrame(() => {
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
