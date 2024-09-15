import { useEffect } from 'react';

type Handler<T extends Event> = (event: T) => void;

const _handlesMap = new Map<
  keyof WindowEventMap,
  Array<Handler<WindowEventMap[keyof WindowEventMap]>>
>();

function initGlobalEvent<T extends keyof WindowEventMap>(name: T) {
  const prev = _handlesMap.get(name);
  if (!prev) {
    const handlers = [] as Handler<WindowEventMap[T]>[];
    window.addEventListener(name, e => {
      handlers.forEach(handler => {
        handler(e);
      });
    });
    _handlesMap.set(name, handlers as any);
    return handlers;
  }
  return prev;
}

function addListener<T extends keyof WindowEventMap>(
  name: T,
  handler: (e: WindowEventMap[T]) => void
) {
  initGlobalEvent(name).push(handler);
}

function removeListener<T extends keyof WindowEventMap>(
  name: T,
  handler: Handler<WindowEventMap[T]>
) {
  const handlers = _handlesMap.get(name) as Handler<WindowEventMap[T]>[];
  const idx = handlers.indexOf(handler);
  if (idx !== -1) {
    handlers.splice(idx, 1);
  }
}

export const useGlobalEvent = <T extends keyof WindowEventMap>(
  name: T,
  handler: (e: WindowEventMap[T]) => void
) => {
  useEffect(() => {
    addListener(name, handler);

    return () => {
      removeListener(name, handler);
    };
  }, [handler, name]);
};
