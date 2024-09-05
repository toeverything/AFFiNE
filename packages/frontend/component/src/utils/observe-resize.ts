import type { ResizeObserverEntry } from '@juggle/resize-observer';

type ObserveResize = {
  callback: (entity: ResizeObserverEntry) => void;
  dispose: () => void;
};

let _resizeObserver: ResizeObserver | null = null;
const elementsMap = new WeakMap<Element, Array<ObserveResize>>();

// for debugging
if (typeof window !== 'undefined') {
  (window as any)._resizeObserverElementsMap = elementsMap;
}
/**
 * @internal get or initialize the ResizeObserver instance
 */
const getResizeObserver = () =>
  (_resizeObserver ??= new ResizeObserver(entries => {
    entries.forEach(entry => {
      const listeners = elementsMap.get(entry.target) ?? [];
      listeners.forEach(({ callback }) => callback(entry));
    });
  }));

/**
 * @internal remove element's specific listener
 */
const removeListener = (element: Element, listener: ObserveResize) => {
  if (!element) return;
  const listeners = elementsMap.get(element) ?? [];
  const observer = getResizeObserver();
  // remove the listener from the element
  if (listeners.includes(listener)) {
    elementsMap.set(
      element,
      listeners.filter(l => l !== listener)
    );
  }
  // if no more listeners, unobserve the element
  if (elementsMap.get(element)?.length === 0) {
    observer.unobserve(element);
    elementsMap.delete(element);
  }
};

/**
 * A function to observe the resize of an element use global ResizeObserver.
 *
 * ```ts
 * useEffect(() => {
 *  const dispose1 = observeResize(elRef1.current, (entry) => {});
 *  const dispose2 = observeResize(elRef2.current, (entry) => {});
 *
 *  return () => {
 *   dispose1();
 *   dispose2();
 *  };
 * }, [])
 * ```
 * @return A function to dispose the observer.
 */
export const observeResize = (
  element: Element,
  callback: ObserveResize['callback']
) => {
  const observer = getResizeObserver();
  if (!elementsMap.has(element)) {
    observer.observe(element);
  }
  const prevListeners = elementsMap.get(element) ?? [];
  const listener = { callback, dispose: () => {} };
  listener.dispose = () => removeListener(element, listener);

  elementsMap.set(element, [...prevListeners, listener]);

  return listener.dispose;
};
