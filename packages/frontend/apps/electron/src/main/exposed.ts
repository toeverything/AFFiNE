import { allEvents as events } from './events';
import { allHandlers as handlers } from './handlers';

// this will be used by preload script to expose all handlers and events to the renderer process
// - register in exposeInMainWorld in preload
// - provide type hints
export { events, handlers };

export const getExposedMeta = () => {
  const handlersMeta = Object.entries(handlers).map(
    ([namespace, namespaceHandlers]) => {
      return [namespace, Object.keys(namespaceHandlers)];
    }
  );

  const eventsMeta = Object.entries(events).map(
    ([namespace, namespaceHandlers]) => {
      return [namespace, Object.keys(namespaceHandlers)];
    }
  );

  return {
    handlers: handlersMeta,
    events: eventsMeta,
  };
};

export type MainIPCHandlerMap = typeof handlers;
export type MainIPCEventMap = typeof events;
