import { dbEvents, dbHandlers } from './db';
import { dialogHandlers } from './dialog';
import { workspaceEvents, workspaceHandlers } from './workspace';

export const handlers = {
  db: dbHandlers,
  workspace: workspaceHandlers,
  dialog: dialogHandlers,
};

export const events = {
  db: dbEvents,
  workspace: workspaceEvents,
};

export function getExposedMeta() {
  const handlersMeta = Object.entries(handlers).map(
    ([namespace, namespaceHandlers]) => {
      return [
        namespace,
        Object.keys(namespaceHandlers).map(handlerName => handlerName),
      ];
    }
  );

  const eventsMeta = Object.entries(events).map(
    ([namespace, namespaceHandlers]) => {
      return [
        namespace,
        Object.keys(namespaceHandlers).map(handlerName => handlerName),
      ];
    }
  );

  return {
    handlers: handlersMeta,
    events: eventsMeta,
  };
}
