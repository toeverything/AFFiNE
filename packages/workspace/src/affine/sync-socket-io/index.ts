import { Observable } from 'lib0/observable';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import * as awarenessProtocol from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import type { Doc as YDoc } from 'yjs';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import type {
  AwarenessChanges,
  DestroyHandler,
  SubdocsHandler,
  UpdateHandler,
} from './utils';
import { base64ToUint8Array, uint8ArrayToBase64 } from './utils';

// TODO: remove this after lazy-provider stable
export class SocketIOProvider extends Observable<string> {
  updateHandlerMap = new Map<string, UpdateHandler>();
  subdocsHandlerMap = new Map<string, SubdocsHandler>();
  destroyHandlerMap = new Map<string, DestroyHandler>();
  docMap = new Map<string, YDoc>();
  updateCache = new Map<string, Uint8Array[]>();
  intervalId: number | null = null;
  cacheClearingInterval = 1000;
  socket: Socket;
  awareness: awarenessProtocol.Awareness;
  rootDoc: YDoc;
  startedConnecting = false;
  _connected: boolean;
  synced: boolean;
  connectPromise: Promise<void>;
  connectResolve: () => void = () => {};
  syncPromise: Promise<void>;
  syncResolve: () => void = () => {};
  disconnectPromise: Promise<void>;
  disconnectResolve: () => void = () => {};
  subDocsHasHandshake = false;

  constructor(
    serverUrl: string,
    roomName: string,
    doc: YDoc,
    { awareness = new awarenessProtocol.Awareness(doc) } = {}
  ) {
    super();
    if (roomName !== doc.guid) {
      console.warn('important!! please use doc.guid as roomName');
    }
    this.rootDoc = doc;
    this.socket = io(serverUrl, {
      autoConnect: false,
    });
    this.awareness = awareness;
    this._connected = false;
    this.synced = false;
    this.connectPromise = new Promise(resolve => {
      this.connectResolve = resolve;
    });
    this.syncPromise = new Promise(resolve => {
      this.syncResolve = resolve;
    });
    this.disconnectPromise = new Promise(resolve => {
      this.disconnectResolve = resolve;
    });
  }

  serverHandshakeHandler = (message: { guid: string; update: string }) => {
    const update = base64ToUint8Array(message.update);
    const doc = this.docMap.get(message.guid);
    if (!doc) {
      this.cacheUnloadDocUpdate(message.guid, update);
      return;
    }

    // sending missing update for server
    const diffUpdate = encodeStateAsUpdate(doc, update);
    uint8ArrayToBase64(diffUpdate)
      .then(encodedUpdate => {
        this.socket.emit('client-update', {
          workspaceId: this.rootDoc.guid,
          guid: doc.guid,
          update: encodedUpdate,
        });
      })
      .catch(err => console.log(err));

    if (!this.subDocsHasHandshake) {
      this.subDocsHandshake(this.rootDoc.guid, doc.subdocs);
      this.subDocsHasHandshake = true;
    }

    // apply update from server
    applyUpdate(doc, update, 'server');
    doc.emit('load', []);
    this.syncResolve();
    this.synced = true;
  };

  subDocsHandshake = (workspaceId: string, subDocs: Set<YDoc>) => {
    if (!subDocs) return;
    subDocs.forEach(doc => {
      const update = encodeStateAsUpdate(doc);
      uint8ArrayToBase64(update)
        .then(encodedUpdate => {
          this.socket.emit('client-update', {
            workspaceId,
            guid: doc.guid,
            update: encodedUpdate,
          });
        })
        .catch(err => console.error(err));

      this.subDocsHandshake(workspaceId, doc.subdocs);
    });
  };

  handlerServerUpdate = (message: { guid: string; update: string }) => {
    const update = base64ToUint8Array(message.update);
    const doc = this.docMap.get(message.guid);
    if (!doc) {
      this.cacheUnloadDocUpdate(message.guid, update);
    } else {
      applyUpdate(doc, update, 'server');
    }
  };

  cacheUnloadDocUpdate(guid: string, update: Uint8Array) {
    const updates = this.updateCache.get(guid) || [];
    updates.push(update);
    if (!this.updateCache.has(guid)) {
      this.updateCache.set(guid, updates);
    }
    !this.intervalId &&
      (this.intervalId = window.setInterval(
        this.applyCachedUpdate,
        this.cacheClearingInterval
      ));
  }

  newClientAwarenessInitHandler = () => {
    const awareness = this.awareness;
    const awarenessUpdate = encodeAwarenessUpdate(awareness, [
      awareness.clientID,
    ]);
    uint8ArrayToBase64(awarenessUpdate)
      .then(encodedAwarenessUpdate => {
        this.socket.emit('awareness-update', {
          guid: this.rootDoc.guid,
          awarenessUpdate: encodedAwarenessUpdate,
        });
      })
      .catch(err => console.error(err));
  };

  serverAwarenessBroadcastHandler = (message: {
    workspaceId: string;
    awarenessUpdate: string;
  }) => {
    applyAwarenessUpdate(
      this.awareness,
      base64ToUint8Array(message.awarenessUpdate),
      'server'
    );
  };

  awarenessUpdateHandler = (changes: AwarenessChanges, origin: unknown) => {
    if (origin === 'server') {
      return;
    }
    const changedClients = Object.values(changes).reduce((res, cur) => [
      ...res,
      ...cur,
    ]);
    const isCurrentClientOffLine = changes.removed.find(
      (client: number) => client === this.rootDoc.clientID
    );
    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    uint8ArrayToBase64(update)
      .then(encodedUpdate => {
        this.socket.emit(
          'awareness-update',
          {
            workspaceId: this.rootDoc.guid,
            awarenessUpdate: encodedUpdate,
          },
          (_: string) => {
            // _ is ack
            if (isCurrentClientOffLine) {
              this.disconnectResolve();
            }
          }
        );
      })
      .catch(err => console.error(err));
  };

  initDocMap = (doc: YDoc) => {
    if (this.docMap.has(doc.guid)) {
      return;
    }
    // register all doc into map
    this.docMap.set(doc.guid, doc);
    doc.subdocs.forEach(this.initDocMap);
  };

  applyCachedUpdate = () => {
    let appliedDocCnt = 0;
    for (const [guid, updates] of this.updateCache) {
      if (updates.length > 0) {
        appliedDocCnt++;
        const doc = this.docMap.get(guid);
        if (doc) {
          for (const update of updates) {
            applyUpdate(doc, update, 'server');
          }
        }
      }
    }

    // If there's no cached update, cancel periodical applyCachedUpdate
    if (!appliedDocCnt) {
      this.intervalId && window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  };

  createOrGetUpdateHandler = (doc: YDoc): UpdateHandler => {
    if (this.updateHandlerMap.has(doc.guid)) {
      return this.updateHandlerMap.get(doc.guid) as UpdateHandler;
    }
    const handler: UpdateHandler = (update, origin) => {
      if (origin === 'server') {
        return;
      }
      uint8ArrayToBase64(update)
        .then(encodedUpdate => {
          this.socket.emit('client-update', {
            workspaceId: this.rootDoc.guid,
            guid: doc.guid,
            update: encodedUpdate,
          });
        })
        .catch(err => console.error(err));
    };
    this.updateHandlerMap.set(doc.guid, handler);
    return handler;
  };

  createOrGetSubdocsHandler = (doc: YDoc): SubdocsHandler => {
    if (this.subdocsHandlerMap.has(doc.guid)) {
      return this.subdocsHandlerMap.get(doc.guid) as SubdocsHandler;
    }

    const handler: SubdocsHandler = event => {
      new Set([...event.added, ...event.loaded]).forEach(doc => {
        this.registerDoc(doc);
        // if there are cached updates, apply them instantly
        this.intervalId && this.applyCachedUpdate();
      });

      event.removed.forEach(this.unregisterDoc);
    };

    this.subdocsHandlerMap.set(doc.guid, handler);
    return handler;
  };

  createOrGetDestroyHandler = (doc: YDoc): DestroyHandler => {
    if (this.destroyHandlerMap.has(doc.guid)) {
      return this.destroyHandlerMap.get(doc.guid) as DestroyHandler;
    }

    const handler: DestroyHandler = () => {
      this.unregisterDoc(doc);
    };

    this.destroyHandlerMap.set(doc.guid, handler);
    return handler;
  };

  registerDoc = (doc: YDoc) => {
    this.initDocMap(doc);
    // register subdocs
    doc.on('subdocs', this.createOrGetSubdocsHandler(doc));
    doc.subdocs.forEach(this.registerDoc);
    // register update
    doc.on('update', this.createOrGetUpdateHandler(doc));
    doc.on('destroy', this.createOrGetDestroyHandler(doc));
  };

  unregisterDoc = (doc: YDoc) => {
    this.docMap.delete(doc.guid);
    doc.subdocs.forEach(this.unregisterDoc);
    doc.off('update', this.createOrGetUpdateHandler(doc));
    doc.off('subdocs', this.createOrGetSubdocsHandler(doc));
    doc.off('destroy', this.createOrGetDestroyHandler(doc));
  };

  waitForConnected = (): Promise<void> => {
    return this.connectPromise;
  };

  waitForSynced = (): Promise<void> => {
    return this.syncPromise;
  };

  get connected() {
    return this._connected;
  }

  connect = () => {
    if (this.startedConnecting) return;
    this.startedConnecting = true;
    const rootDoc = this.rootDoc;
    const socket = this.socket;
    socket.connect();
    socket.on('connect', () => {
      this.connectResolve();
      this._connected = true;
      socket.emit('client-handshake', rootDoc.guid);
      // ask for other clients' awareness
      socket.emit('awareness-init', rootDoc.guid);
    });
    this.disconnectPromise = new Promise(resolve => {
      this.disconnectResolve = resolve;
    });

    this.registerDoc(this.rootDoc);
    // Register the handlers all at once.
    // We don't need to ensure sequence order of server-handshake and server-update, as CRDT is order independent.
    socket.on('server-handshake', this.serverHandshakeHandler);
    socket.on('server-update', this.handlerServerUpdate);
    // help to send awareness update to other clients
    socket.on('new-client-awareness-init', this.newClientAwarenessInitHandler);
    // receive awareness update from other clients
    socket.on(
      'server-awareness-broadcast',
      this.serverAwarenessBroadcastHandler
    );
    this.awareness.on('update', this.awarenessUpdateHandler);
  };

  disconnect = () => {
    this.awareness.destroy(); // will set local awareness to null, then emit awareness update
    this.startedConnecting = false;
    this.connectPromise = new Promise(resolve => {
      this.connectResolve = resolve;
    });
    this.syncPromise = new Promise(resolve => {
      this.syncResolve = resolve;
    });
    const socket = this.socket;
    this.disconnectPromise
      .then(() => {
        socket.disconnect();
      })
      .catch(console.error);
    this._connected = false;
    this.synced = false;

    this.unregisterDoc(this.rootDoc);
    socket.off('server-handshake', this.serverHandshakeHandler);
    socket.off('server-update', this.handlerServerUpdate);
    socket.off('new-client-awareness-init', this.newClientAwarenessInitHandler);
    socket.off(
      'server-awareness-broadcast',
      this.serverAwarenessBroadcastHandler
    );
    this.awareness.off('update', this.awarenessUpdateHandler);

    this.docMap.clear();
  };

  override destroy = () => {
    this.disconnect();
  };
}
