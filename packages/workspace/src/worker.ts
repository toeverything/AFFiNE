import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

const docMap = new Map<string, Doc>();

class WorkerChannel implements EventBasedChannel {
  public worker: Worker = self as any;
  on(listener: (data: unknown) => void): void | (() => void) {
    const f = (ev: MessageEvent): void => listener(ev.data);
    this.worker.addEventListener('message', f);
    return () => this.worker.removeEventListener('message', f);
  }
  send(data: unknown): void {
    this.worker.postMessage(data);
  }
}

export type WorkerMethods = {
  sendUpdate: (
    guid: string,
    update: Uint8Array,
    origin: string | number
  ) => Promise<void>;
  deleteDoc: (guid: string) => Promise<void>;
  encodeStateAsUpdate: (guid: string) => Promise<Uint8Array>;
};

const methods = {
  sendUpdate: async (
    guid: string,
    update: Uint8Array,
    origin: string | number
  ) => {
    let doc = docMap.get(guid);
    if (!doc) {
      doc = new Doc({
        guid,
      });
      docMap.set(guid, doc);
    }
    applyUpdate(doc, update, origin);
  },
  deleteDoc: async (guid: string) => {
    docMap.delete(guid);
  },
  encodeStateAsUpdate: async (guid: string) => {
    const doc = docMap.get(guid);
    if (!doc) {
      return Promise.reject(new Error('doc not found'));
    }
    return encodeStateAsUpdate(doc);
  },
} satisfies WorkerMethods;

AsyncCall(methods, {
  channel: new WorkerChannel(),
});
