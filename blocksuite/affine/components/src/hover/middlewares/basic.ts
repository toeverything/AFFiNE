import { sleep } from '@blocksuite/global/utils';

import type { HoverMiddleware } from '../types.js';

/**
 * When the mouse is hovering in, the `mouseover` event will be fired multiple times.
 * This middleware will filter out the duplicated events.
 */
export const dedupe = (keepWhenFloatingNotReady = true): HoverMiddleware => {
  const SKIP = false;
  const KEEP = true;
  let hoverState = false;
  return ({ event, floatingElement }) => {
    const curState = hoverState;
    if (event.type === 'mouseenter') {
      // hover in
      hoverState = true;
      if (curState !== hoverState)
        // state changed, so we should keep the event
        return KEEP;
      if (
        keepWhenFloatingNotReady &&
        (!floatingElement || !floatingElement.isConnected)
      ) {
        // Already hovered
        // But the floating element is not ready
        // so we should not skip the event
        return KEEP;
      }
      return SKIP;
    }
    if (event.type === 'mouseleave') {
      // hover out
      hoverState = false;
      if (curState !== hoverState) return KEEP;
      if (keepWhenFloatingNotReady && floatingElement?.isConnected) {
        // Already hover out
        // But the floating element is still showing
        // so we should not skip the event
        return KEEP;
      }
      return SKIP;
    }
    console.warn('Unknown event type in hover middleware', event);
    return KEEP;
  };
};

/**
 * Wait some time before emitting the `mouseover` event.
 */
export const delayShow = (delay: number): HoverMiddleware => {
  let abortController = new AbortController();
  return async ({ event }) => {
    abortController.abort();
    const newAbortController = new AbortController();
    abortController = newAbortController;
    if (event.type !== 'mouseenter') return true;
    if (delay <= 0) return true;
    await sleep(delay, newAbortController.signal);
    return !newAbortController.signal.aborted;
  };
};

/**
 * Wait some time before emitting the `mouseleave` event.
 */
export const delayHide = (delay: number): HoverMiddleware => {
  let abortController = new AbortController();
  return async ({ event }) => {
    abortController.abort();
    const newAbortController = new AbortController();
    abortController = newAbortController;
    if (event.type !== 'mouseleave') return true;
    if (delay <= 0) return true;
    await sleep(delay, newAbortController.signal);
    return !newAbortController.signal.aborted;
  };
};
