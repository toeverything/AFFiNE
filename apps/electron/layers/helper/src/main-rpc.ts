import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import type { app, dialog, shell } from 'electron';

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
>;

export const mainRPC = AsyncCall<MainServer>(
  {},
  {
    strict: {
      unknownMessage: false,
    },
    channel: createMessagePortMainChannel(process.parentPort),
  }
);
