import { Observable } from 'lib0/observable';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import * as awarenessProtocol from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import type { Doc } from 'yjs';
import * as Y from 'yjs';

import type {
  AwarenessChanges,
  DestroyHandler,
  SubdocsHandler,
  UpdateHandler,
} from './utils';
import { base64ToUint8Array, uint8ArrayToBase64 } from './utils';

export class SocketIOProvider extends Observable<string> {
  updateHandlerWeakMap = new WeakMap<Doc, UpdateHandler>();
  subdocsHandlerWeakMap = new WeakMap<Doc, SubdocsHandler>();
  destroyHandlerWeakMap = new WeakMap<Doc, DestroyHandler>();
  docMap = new Map<string, Doc>();
  updateCache = new Map<string, Uint8Array[]>();
  intervalId: number | null = null;
  cacheClearingInterval = 1000;
  socket: Socket;
  awareness: awarenessProtocol.Awareness;
  rootDoc: Doc;
  startedConnecting = false;
  _connected: boolean;
  synced: boolean;
  connectPromise: Promise<void>;
  connectResolve: () => void = () => {};
  syncPromise: Promise<void>;
  syncResolve: () => void = () => {};
  subDocsHasHandshake = false;

  constructor(
    serverUrl: string,
    roomName: string,
    doc: Y.Doc,
    { awareness = new awarenessProtocol.Awareness(doc) } = {}
  ) {
    super();
    if (roomName !== doc.guid) {
      console.warn('important!! please use doc.guid as roomName');
    }
    this.rootDoc = doc;
    const socket = (this.socket = io(serverUrl, {
      autoConnect: false,
    }));
    this.awareness = awareness;
    this._connected = false;
    this.synced = false;
    this.registerDoc(doc);
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
    awareness.on('update', this.awarenessUpdateHandler);
    this.connectPromise = new Promise(resolve => {
      this.connectResolve = resolve;
    });
    this.syncPromise = new Promise(resolve => {
      this.syncResolve = resolve;
    });
  }

  serverHandshakeHandler = (message: { guid: string; update: string }) => {
    const update = base64ToUint8Array(message.update);
    const doc = this.docMap.get(message.guid);
    if (!doc) {
      const updates = this.updateCache.get(message.guid) || [];
      updates.push(update);
      !this.intervalId &&
        (this.intervalId = window.setInterval(
          this.applyCachedUpdate,
          this.cacheClearingInterval
        ));
      return;
    }

    // sending missing update for server
    const diffUpdate = Y.encodeStateAsUpdate(doc, update);
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
    Y.applyUpdate(doc, update, 'server');
    doc.emit('load', []);
    this.syncResolve();
    this.synced = true;
  };

  subDocsHandshake = (workspaceId: string, subDocs: Set<Doc>) => {
    if (!subDocs) return;
    subDocs.forEach(doc => {
      const update = Y.encodeStateAsUpdate(doc);
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
      const updates = this.updateCache.get(message.guid) || [];
      updates.push(update);
      !this.intervalId &&
        (this.intervalId = window.setInterval(
          this.applyCachedUpdate,
          this.cacheClearingInterval
        ));
    } else {
      Y.applyUpdate(doc, update, 'server');
    }
  };

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
    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    uint8ArrayToBase64(update)
      .then(encodedUpdate => {
        this.socket.emit('awareness-update', {
          workspaceId: this.rootDoc.guid,
          awarenessUpdate: encodedUpdate,
        });
      })
      .catch(err => console.error(err));
  };

  initDocMap = (doc: Doc) => {
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
            Y.applyUpdate(doc, update, 'server');
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

  createOrGetUpdateHandler = (doc: Doc): UpdateHandler => {
    if (this.updateHandlerWeakMap.has(doc)) {
      return this.updateHandlerWeakMap.get(doc) as UpdateHandler;
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
    this.updateHandlerWeakMap.set(doc, handler);
    return handler;
  };

  createOrGetSubdocsHandler = (doc: Doc): SubdocsHandler => {
    if (this.subdocsHandlerWeakMap.has(doc)) {
      return this.subdocsHandlerWeakMap.get(doc) as SubdocsHandler;
    }

    const handler: SubdocsHandler = event => {
      new Set([...event.added, ...event.loaded]).forEach(doc => {
        this.registerDoc(doc);
        // if there are cached updates, apply them instantly
        this.intervalId && this.applyCachedUpdate();
      });

      event.removed.forEach(this.unregisterDoc);
    };

    this.subdocsHandlerWeakMap.set(doc, handler);
    return handler;
  };

  createOrGetDestroyHandler = (doc: Doc): DestroyHandler => {
    if (this.destroyHandlerWeakMap.has(doc)) {
      return this.destroyHandlerWeakMap.get(doc) as DestroyHandler;
    }

    const handler: DestroyHandler = () => {
      this.unregisterDoc(doc);
    };

    this.destroyHandlerWeakMap.set(doc, handler);
    return handler;
  };

  registerDoc = (doc: Doc) => {
    this.initDocMap(doc);
    // register subdocs
    doc.on('subdocs', this.createOrGetSubdocsHandler(doc));
    doc.subdocs.forEach(this.registerDoc);
    // register update
    doc.on('update', this.createOrGetUpdateHandler(doc));
    doc.on('destroy', this.createOrGetDestroyHandler(doc));
  };

  unregisterDoc = (doc: Doc) => {
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
      socket.emit('init-awareness', rootDoc.guid);
    });
  };

  disconnect = () => {
    this.startedConnecting = false;
    this.connectPromise = new Promise(resolve => {
      this.connectResolve = resolve;
    });
    this.syncPromise = new Promise(resolve => {
      this.syncResolve = resolve;
    });
    const socket = this.socket;
    socket.disconnect();
    this._connected = false;
    this.synced = false;
  };

  override destroy = () => {
    const socket = this.socket;
    const awareness = this.awareness;
    this.unregisterDoc(this.rootDoc);
    socket.off('server-handshake', this.serverHandshakeHandler);
    socket.off('server-update', this.handlerServerUpdate);
    socket.off('new-client-awareness-init', this.newClientAwarenessInitHandler);
    socket.off(
      'server-awareness-broadcast',
      this.serverAwarenessBroadcastHandler
    );
    awareness.off('update', this.awarenessUpdateHandler);
  };
}
