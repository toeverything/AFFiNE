import { dedupe, delayHide, delayShow } from './middlewares/basic.js';
import { safeBridge, safeTriangle } from './middlewares/safe-area.js';
import type { HoverMiddleware, WhenHoverOptions } from './types.js';

/**
 * Call the `whenHoverChange` callback when the element is hovered.
 *
 * After the mouse leaves the element, there is a 300ms delay by default.
 *
 * Note: The callback may be called multiple times when the mouse is hovering or hovering out.
 *
 * See also https://floating-ui.com/docs/useHover
 *
 * @example
 * ```ts
 * private _setReference: RefOrCallback;
 *
 * connectedCallback() {
 *   let hoverTip: HTMLElement | null = null;
 *   const { setReference, setFloating } = whenHover(isHover => {
 *     if (!isHover) {
 *       hoverTips?.remove();
 *       return;
 *     }
 *     hoverTip = document.createElement('div');
 *     document.body.append(hoverTip);
 *     setFloating(hoverTip);
 *   }, { hoverDelay: 500 });
 *   this._setReference = setReference;
 * }
 *
 * render() {
 *   return html`
 *     <div ref=${this._setReference}></div>
 *   `;
 * }
 * ```
 */
export const whenHover = (
  whenHoverChange: (isHover: boolean, event?: Event) => void,
  {
    enterDelay = 0,
    leaveDelay = 250,
    alwayRunWhenNoFloating = true,
    safeTriangle: triangleOptions = false,
    safeBridge: bridgeOptions = true,
  }: WhenHoverOptions = {}
) => {
  /**
   * The event listener will be removed when the signal is aborted.
   */
  const abortController = new AbortController();
  let referenceElement: Element | undefined;
  let floatingElement: Element | undefined;

  const middlewares: HoverMiddleware[] = [
    dedupe(alwayRunWhenNoFloating),
    triangleOptions &&
      safeTriangle(
        typeof triangleOptions === 'boolean' ? undefined : triangleOptions
      ),
    bridgeOptions &&
      safeBridge(
        typeof bridgeOptions === 'boolean' ? undefined : bridgeOptions
      ),
    delayShow(enterDelay),
    delayHide(leaveDelay),
  ].filter(v => typeof v !== 'boolean') as HoverMiddleware[];

  let currentEvent: Event | null = null;
  const onHoverChange = (async (e: Event) => {
    currentEvent = e;
    for (const middleware of middlewares) {
      const go = await middleware({
        event: e,
        floatingElement,
        referenceElement,
      });
      if (!go) return;
    }
    // ignore expired event
    if (e !== currentEvent) return;
    const isHover = e.type === 'mouseenter' ? true : false;
    whenHoverChange(isHover, e);
  }) as (e: Event) => void;

  const addHoverListener = (element?: Element) => {
    if (!element) return;
    // see https://stackoverflow.com/questions/14795099/pure-javascript-to-check-if-something-has-hover-without-setting-on-mouseover-ou
    const alreadyHover = element.matches(':hover');
    if (alreadyHover && !abortController.signal.aborted) {
      // When the element is already hovered, we need to trigger the callback manually
      onHoverChange(new MouseEvent('mouseenter'));
    }
    element.addEventListener('mouseenter', onHoverChange, {
      capture: true,
      signal: abortController.signal,
    });
    element.addEventListener('mouseleave', onHoverChange, {
      // Please refrain use `capture: true` here.
      // It will cause the `mouseleave` trigger incorrectly when the pointer is still within the element.
      // The issue is detailed in https://github.com/toeverything/blocksuite/issues/6241
      //
      // The `mouseleave` does not **bubble**.
      // This means that `mouseleave` is fired when the pointer has exited the element and all of its descendants,
      // If `capture` is used, all `mouseleave` events will be received when the pointer leaves the element or leaves one of the element's descendants (even if the pointer is still within the element).
      //
      // capture: true,
      signal: abortController.signal,
    });
  };

  const removeHoverListener = (element?: Element) => {
    if (!element) return;
    element.removeEventListener('mouseenter', onHoverChange, {
      capture: true,
    });
    element.removeEventListener('mouseleave', onHoverChange);
  };

  const setReference = (element?: Element) => {
    // Clean previous listeners
    removeHoverListener(referenceElement);
    addHoverListener(element);
    referenceElement = element;
  };

  const setFloating = (element?: Element) => {
    // Clean previous listeners
    removeHoverListener(floatingElement);
    addHoverListener(element);
    floatingElement = element;
  };

  return {
    setReference,
    setFloating,
    dispose: () => {
      abortController.abort();
    },
  };
};

export type { WhenHoverOptions };
