import { DebugLogger } from '@affine/debug';
import { nanoid } from 'nanoid';
import { map } from 'rxjs';
import type { Doc as YDoc } from 'yjs';

import { createIdentifier } from '../../../di';
import { LiveData } from '../../../livedata';
import { MANUALLY_STOP } from '../../../utils';
import { type EventBus, EventBusInner } from './event';
import { DocEngineLocalPart } from './local';
import { DocEngineRemotePart } from './remote';
import type { Server } from './server';
import { type Storage, StorageInner } from './storage';

const logger = new DebugLogger('doc-engine');

export type {
  Event as DocEngineEvent,
  EventBus as DocEngineEventBus,
} from './event';
export { MemoryEventBus as DocEngineMemoryEventBus } from './event';
export type { Server as DocEngineServer } from './server';
export type { Storage as DocEngineStorage } from './storage';
export {
  MemoryStorage as DocEngineMemoryStorage,
  ReadonlyStorage as DocEngineReadonlyStorage,
} from './storage';

export const DocEngineEventBusImpl =
  createIdentifier<EventBus>('DocEngineEventBus');

export const DocEngineServerImpl = createIdentifier<Server>('DocEngineServer');

export const DocEngineStorageImpl =
  createIdentifier<Storage>('DocEngineStorage');

export class DocEngine {
  localPart: DocEngineLocalPart;
  remotePart: DocEngineRemotePart | null;

  storage: StorageInner;
  eventBus: EventBusInner;

  engineState = LiveData.computed(get => {
    const localState = get(this.localPart.engineState);
    if (this.remotePart) {
      const remoteState = get(this.remotePart?.engineState);
      return {
        total: remoteState.total,
        syncing: remoteState.syncing,
        saving: localState.syncing,
        retrying: remoteState.retrying,
        errorMessage: remoteState.errorMessage,
      };
    }
    return {
      total: localState.total,
      syncing: localState.syncing,
      saving: localState.syncing,
      retrying: false,
      errorMessage: null,
    };
  });

  docState(docId: string) {
    const localState = this.localPart.docState(docId);
    const remoteState = this.remotePart?.docState(docId);
    return LiveData.computed(get => {
      const local = get(localState);
      const remote = remoteState ? get(remoteState) : null;
      return {
        ready: local.ready,
        saving: local.syncing,
        syncing: local.syncing || remote?.syncing,
      };
    });
  }

  constructor(
    storage: Storage,
    eventBus: EventBus,
    private readonly server?: Server | null,
    doc?: YDoc
  ) {
    const clientId = nanoid();
    this.storage = new StorageInner(storage);
    this.eventBus = new EventBusInner(eventBus);
    this.localPart = new DocEngineLocalPart(
      clientId,
      this.storage,
      this.eventBus
    );
    this.remotePart = this.server
      ? new DocEngineRemotePart(
          clientId,
          this.storage,
          this.server,
          this.eventBus
        )
      : null;

    if (doc) {
      this.addDoc(doc);
    }
  }

  abort = new AbortController();

  start() {
    this.abort.abort(MANUALLY_STOP);
    this.abort = new AbortController();
    Promise.all([
      this.localPart.mainLoop(this.abort.signal),
      this.remotePart?.mainLoop(this.abort.signal),
    ]).catch(err => {
      if (err === MANUALLY_STOP) {
        return;
      }
      logger.error('Doc engine error', err);
    });
    return this;
  }

  stop() {
    this.abort.abort(MANUALLY_STOP);
  }

  addDoc(doc: YDoc, withSubDocs = true) {
    this.localPart.actions.addDoc(doc);
    this.remotePart?.actions.addDoc(doc.guid);

    if (withSubDocs) {
      const subdocs = doc.getSubdocs();
      for (const subdoc of subdocs) {
        this.addDoc(subdoc, false);
      }
      doc.on('subdocs', ({ added }: { added: Set<YDoc> }) => {
        for (const subdoc of added) {
          this.addDoc(subdoc, false);
        }
      });
    }
  }

  setPriority(docId: string, priority: number) {
    this.localPart.setPriority(docId, priority);
    this.remotePart?.setPriority(docId, priority);
  }

  waitForSaved() {
    return new Promise<void>(resolve => {
      this.engineState
        .pipe(map(state => state.saving === 0))
        .subscribe(saved => {
          if (saved) {
            resolve();
          }
        });
    });
  }

  waitForSynced() {
    return new Promise<void>(resolve => {
      this.engineState
        .pipe(map(state => state.syncing === 0 && state.saving === 0))
        .subscribe(synced => {
          if (synced) {
            resolve();
          }
        });
    });
  }

  waitForReady(docId: string) {
    return new Promise<void>(resolve => {
      this.docState(docId)
        .pipe(map(state => state.ready))
        .subscribe(ready => {
          if (ready) {
            resolve();
          }
        });
    });
  }
}
