import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import type { app, dialog, shell } from 'electron';

import { getExposedMeta } from './exposed';
import { logger } from './logger';

function createMessagePortMainChannel(
  connection: Electron.ParentPort
): EventBasedChannel {
  return {
    on(listener) {
      const f = (e: Electron.MessageEvent) => {
        listener(e.data);
      };
      connection.on('message', f);
      return () => {
        connection.off('message', f);
      };
    },
    send(data) {
      connection.postMessage(data);
    },
  };
}

// TODO: may need a better way to type this
type MainServer = Pick<
  typeof dialog & typeof shell & typeof app,
  | 'showOpenDialog'
  | 'showSaveDialog'
  | 'openExternal'
  | 'showItemInFolder'
  | 'getPath'
> & {
  exposeHelperMeta: (meta: ReturnType<typeof getExposedMeta>) => void;
};

export const mainRPC = AsyncCall<MainServer>(
  {},
  {
    strict: {
      unknownMessage: false,
    },
    channel: createMessagePortMainChannel(process.parentPort),
  }
);

process.on('loaded', () => {
  mainRPC.exposeHelperMeta(getExposedMeta()).catch(err => {
    logger.error('[main] exposeMeta', err);
  });
});
