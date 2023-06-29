import { AsyncCall } from 'async-call-rpc';

import { getExposedMeta } from './exposed';

const helperToMainServer: PeersAPIs.HelperToMain = {
  getMeta: () => getExposedMeta(),
};

export const mainRPC = AsyncCall<PeersAPIs.MainToHelper>(helperToMainServer, {
  strict: {
    unknownMessage: false,
  },
  channel: {
    on(listener) {
      const f = (e: Electron.MessageEvent) => {
        listener(e.data);
      };
      process.parentPort.on('message', f);
      return () => {
        process.parentPort.off('message', f);
      };
    },
    send(data) {
      process.parentPort.postMessage(data);
    },
  },
});
