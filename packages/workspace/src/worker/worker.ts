import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Generator, Workspace } from '@blocksuite/store';
import {
  createIndexedDBProvider,
  DEFAULT_DB_NAME,
} from '@toeverything/y-indexeddb';
import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import type { Doc } from 'yjs';
import { applyUpdate } from 'yjs';

import type { MainMethods, SubdocEvent } from './main';

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
  registerWorkspace: (guid: string) => Promise<void>;
  applyUpdate: (
    guid: string,
    update: Uint8Array,
    origin?: string | number
  ) => Promise<void>;
};

const methods = {
  registerWorkspace: async guid => {
    const workspace = new Workspace({
      id: guid,
      idGenerator: Generator.NanoID,
    })
      .register(AffineSchemas)
      .register(__unstableSchemas);
    docMap.set(guid, workspace.doc);
    const registerDocUpdate = (doc: Doc) => {
      doc.on('update', (update, origin) => {
        rpc.applyUpdate(doc.guid, update, origin).catch(console.error);
      });
    };

    registerDocUpdate(workspace.doc);

    workspace.doc.on('subdocs', (event: SubdocEvent) => {
      event.added.forEach(doc => {
        registerDocUpdate(doc);
      });
    });

    const provider = createIndexedDBProvider(
      workspace.doc,
      DEFAULT_DB_NAME,
      false
    );
    provider.connect();
  },
  applyUpdate: async (guid, update, origin) => {
    const doc = docMap.get(guid);
    if (!doc) {
      throw new Error(`Workspace ${guid} not found`);
    }
    doc.transact(() => {
      applyUpdate(doc, update, origin);
    });
  },
} satisfies WorkerMethods;

const rpc = AsyncCall<MainMethods>(methods, {
  channel: new WorkerChannel(),
  log: false,
});
