import { dialogHandlers } from './dialog';
import { fileHandlers } from './file';
import { dbEventsV1, dbHandlersV1, nbstoreHandlers } from './nbstore';
import { provideExposed } from './provide';
import { workspaceEvents, workspaceHandlers } from './workspace';

export const handlers = {
  db: dbHandlersV1,
  nbstore: nbstoreHandlers,
  workspace: workspaceHandlers,
  dialog: dialogHandlers,
  file: fileHandlers,
};

export const events = {
  db: dbEventsV1,
  workspace: workspaceEvents,
};

const getExposedMeta = () => {
  const handlersMeta = Object.entries(handlers).map(
    ([namespace, namespaceHandlers]) => {
      return [namespace, Object.keys(namespaceHandlers)] as [string, string[]];
    }
  );

  const eventsMeta = Object.entries(events).map(
    ([namespace, namespaceHandlers]) => {
      return [namespace, Object.keys(namespaceHandlers)] as [string, string[]];
    }
  );

  return {
    handlers: handlersMeta,
    events: eventsMeta,
  };
};

provideExposed(getExposedMeta());
