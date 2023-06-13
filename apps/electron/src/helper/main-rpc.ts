import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';

import { getExposedMeta } from './exposed';

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

const helperToMainServer: PeersAPIs.HelperToMain = {
  getMeta: () => getExposedMeta(),
};

export const mainRPC = AsyncCall<PeersAPIs.MainToHelper>(helperToMainServer, {
  strict: {
    unknownMessage: false,
  },
  channel: createMessagePortMainChannel(process.parentPort),
});
