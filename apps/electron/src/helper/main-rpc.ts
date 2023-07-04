import type {
  HelperToMain,
  MainToHelper,
} from '@toeverything/infra/preload/electron';
import { AsyncCall } from 'async-call-rpc';

import { getExposedMeta } from './exposed';

const helperToMainServer: HelperToMain = {
  getMeta: () => getExposedMeta(),
};

export const mainRPC = AsyncCall<MainToHelper>(helperToMainServer, {
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
