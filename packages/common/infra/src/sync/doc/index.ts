import { DebugLogger } from '@affine/debug';
import { nanoid } from 'nanoid';
import { map } from 'rxjs';
import type { Doc as YDoc } from 'yjs';

import { LiveData } from '../../livedata';
import { MANUALLY_STOP } from '../../utils';
import { DocEngineLocalPart } from './local';
import { DocEngineRemotePart } from './remote';
import type { DocServer } from './server';
import type { DocStorage } from './storage';
import { DocStorageInner } from './storage';

const logger = new DebugLogger('doc-engine');

export type { DocEvent, DocEventBus } from './event';
export { MemoryDocEventBus } from './event';
export type { DocServer } from './server';
export type { DocStorage } from './storage';
export {
  MemoryStorage as MemoryDocStorage,
  ReadonlyStorage as ReadonlyDocStorage,
} from './storage';

export interface DocEngineDocState {
  /**
   * is syncing with the server
   */
  syncing: boolean;
  /**
   * is saving to local storage
   */
  saving: boolean;
  /**
   * is loading from local storage
   */
  loading: boolean;
  retrying: boolean;
  ready: boolean;
  errorMessage: string | null;
  serverClock: number | null;
}

export class DocEngine {
  readonly clientId: string;
  localPart: DocEngineLocalPart;
  remotePart: DocEngineRemotePart | null;

  storage: DocStorageInner;

  engineState$ = LiveData.computed(get => {
    const localState = get(this.localPart.engineState$);
    if (this.remotePart) {
      const remoteState = get(this.remotePart?.engineState$);
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

  docState$(docId: string) {
    const localState$ = this.localPart.docState$(docId);
    const remoteState$ = this.remotePart?.docState$(docId);
    return LiveData.computed<DocEngineDocState>(get => {
      const localState = get(localState$);
      const remoteState = remoteState$ ? get(remoteState$) : null;
      if (remoteState) {
        return {
          syncing: remoteState.syncing,
          saving: localState.syncing,
          loading: localState.syncing,
          retrying: remoteState.retrying,
          ready: localState.ready,
          errorMessage: remoteState.errorMessage,
          serverClock: remoteState.serverClock,
        };
      }
      return {
        syncing: localState.syncing,
        saving: localState.syncing,
        loading: localState.syncing,
        ready: localState.ready,
        retrying: false,
        errorMessage: null,
        serverClock: null,
      };
    });
  }

  markAsReady(docId: string) {
    this.localPart.actions.markAsReady(docId);
  }

  constructor(
    storage: DocStorage,
    private readonly server?: DocServer | null
  ) {
    this.clientId = nanoid();
    this.storage = new DocStorageInner(storage);
    this.localPart = new DocEngineLocalPart(this.clientId, this.storage);
    this.remotePart = this.server
      ? new DocEngineRemotePart(this.clientId, this.storage, this.server)
      : null;
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

  async resetSyncStatus() {
    this.stop();
    await this.storage.clearSyncMetadata();
    await this.storage.clearServerClock();
  }

  addDoc(doc: YDoc, withSubDocs = true) {
    this.remotePart?.actions.addDoc(doc.guid);
    this.localPart.actions.addDoc(doc);

    if (withSubDocs) {
      doc.on('subdocs', ({ added, loaded }) => {
        // added: the subdocs that are existing on the ydoc
        // loaded: the subdocs that have been called `ydoc.load()`
        //
        // we add all existing subdocs to remote part, let them sync between storage and server
        // but only add loaded subdocs to local part, let them sync between storage and ydoc
        // sync data to ydoc will consume more memory, so we only sync the ydoc that are necessary.
        for (const subdoc of added) {
          this.remotePart?.actions.addDoc(subdoc.guid);
        }
        for (const subdoc of loaded) {
          this.localPart.actions.addDoc(subdoc);
        }
      });
    }
  }

  setPriority(docId: string, priority: number) {
    this.localPart.setPriority(docId, priority);
    this.remotePart?.setPriority(docId, priority);
  }

  /**
   * ## Saved:
   * YDoc changes have been saved to storage, and the browser can be safely closed without losing data.
   */
  waitForSaved() {
    return new Promise<void>(resolve => {
      this.engineState$
        .pipe(map(state => state.saving === 0))
        .subscribe(saved => {
          if (saved) {
            resolve();
          }
        });
    });
  }

  /**
   * ## Synced:
   * is fully synchronized with the server
   */
  waitForSynced() {
    return new Promise<void>(resolve => {
      this.engineState$
        .pipe(map(state => state.syncing === 0 && state.saving === 0))
        .subscribe(synced => {
          if (synced) {
            resolve();
          }
        });
    });
  }

  /**
   * ## Ready:
   *
   * means that the doc has been loaded and the data can be modified.
   * (is not force, you can still modify it if you know you are creating some new data)
   *
   * this is a temporary solution to deal with the yjs overwrite issue.
   *
   * if content is loaded from storage
   * or if content is pulled from the server, it will be true, otherwise be false.
   *
   * For example, when opening a doc that is not in storage, ready = false until the content is pulled from the server.
   */
  waitForReady(docId: string) {
    return new Promise<void>(resolve => {
      this.docState$(docId)
        .pipe(map(state => state.ready))
        .subscribe(ready => {
          if (ready) {
            resolve();
          }
        });
    });
  }

  dispose() {
    this.stop();
    this.server?.dispose?.();
  }
}
