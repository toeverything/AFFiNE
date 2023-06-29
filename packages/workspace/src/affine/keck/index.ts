import { isBrowser } from '@affine/env/constant';
import * as encoding from 'lib0/encoding';
import * as math from 'lib0/math';
import { Observable } from 'lib0/observable';
import * as url from 'lib0/url';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

import { handler, Message } from './handler';
import { readMessage } from './processor';

// @todo - this should depend on awareness.outdatedTime
const messageReconnectTimeout = 30000;

const setupWS = (provider: KeckProvider) => {
  if (provider.shouldConnect && provider.ws === null) {
    const websocket = new WebSocket(provider.url);
    websocket.binaryType = 'arraybuffer';
    provider.ws = websocket;
    provider.wsconnecting = true;
    provider.wsconnected = false;
    provider.synced = false;

    websocket.onmessage = (event: any) => {
      provider.wsLastMessageReceived = Date.now();
      const encoder = readMessage(provider, new Uint8Array(event.data), true);
      if (encoding.length(encoder) > 1) {
        websocket.send(encoding.toUint8Array(encoder));
      }
    };
    websocket.onerror = (event: any) => {
      provider.emit('connection-error', [event, provider]);
    };
    websocket.onclose = (event: any) => {
      provider.emit('connection-close', [event, provider]);
      provider.ws = null;
      provider.wsconnecting = false;
      if (provider.wsconnected) {
        provider.wsconnected = false;
        provider.synced = false;
        // update awareness (all users except local left)
        awarenessProtocol.removeAwarenessStates(
          provider.awareness,
          Array.from(provider.awareness.getStates().keys()).filter(
            client => client !== provider.doc.clientID
          ),
          provider
        );
        provider.emit('status', [
          {
            status: 'disconnected',
          },
        ]);
      } else {
        provider.wsUnsuccessfulReconnects++;
      }
      // Start with no reconnect timeout and increase timeout by
      // using exponential backoff starting with 100ms
      setTimeout(
        setupWS,
        math.min(
          math.pow(2, provider.wsUnsuccessfulReconnects) * 100,
          provider.maxBackOffTime
        ) + provider.extraToleranceTime,
        provider
      );
    };
    websocket.onopen = () => {
      provider.wsLastMessageReceived = Date.now();
      provider.wsconnecting = false;
      provider.wsconnected = true;
      provider.wsUnsuccessfulReconnects = 0;
      provider.emit('status', [
        {
          status: 'connected',
        },
      ]);
      // always send sync step 1 when connected
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, Message.sync);
      syncProtocol.writeSyncStep1(encoder, provider.doc);
      websocket.send(encoding.toUint8Array(encoder));
      // broadcast local awareness state
      if (provider.awareness.getLocalState() !== null) {
        const encoderAwarenessState = encoding.createEncoder();
        encoding.writeVarUint(encoderAwarenessState, Message.awareness);
        encoding.writeVarUint8Array(
          encoderAwarenessState,
          awarenessProtocol.encodeAwarenessUpdate(provider.awareness, [
            provider.doc.clientID,
          ])
        );
        websocket.send(encoding.toUint8Array(encoderAwarenessState));
      }
    };
    provider.emit('status', [
      {
        status: 'connecting',
      },
    ]);
  }
};

const broadcastMessage = (provider: KeckProvider, buf: ArrayBuffer) => {
  const ws = provider.ws;
  if (provider.wsconnected && ws && ws.readyState === ws.OPEN) {
    ws.send(buf);
  }
};

export class KeckProvider extends Observable<string> {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  url: any;
  messageHandlers: typeof handler;
  shouldConnect: boolean;
  ws: any;
  wsconnecting: boolean;
  wsconnected: boolean;
  wsLastMessageReceived: number;
  wsUnsuccessfulReconnects: any;
  maxBackOffTime: number;
  roomName: string;
  _synced: boolean;
  _resyncInterval: any;
  extraToleranceTime: number;
  _updateHandler: (update: Uint8Array, origin: any) => void;
  _awarenessUpdateHandler: ({ added, updated, removed }: any) => void;
  _unloadHandler: () => void;
  _checkInterval: NodeJS.Timer;

  constructor(
    serverUrl: string,
    roomName: string,
    doc: Y.Doc,
    {
      connect = true,
      awareness = new awarenessProtocol.Awareness(doc),
      params = {},
      resyncInterval = -1,
      maxBackOffTime = 2500,
      extraToleranceTime = 0,
    } = {}
  ) {
    super();
    // ensure that url is always ends with /
    while (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1);
    }
    const encodedParams = url.encodeQueryParams(params);
    this.maxBackOffTime = maxBackOffTime;
    this.extraToleranceTime = extraToleranceTime;
    this.url =
      serverUrl +
      '/' +
      roomName +
      (encodedParams.length === 0 ? '' : '?' + encodedParams);
    this.roomName = roomName;
    this.doc = doc;
    this.awareness = awareness;
    this.wsconnected = false;
    this.wsconnecting = false;
    this.wsUnsuccessfulReconnects = 0;
    this.messageHandlers = handler;
    /**
     * @type {boolean}
     */
    this._synced = false;
    /**
     * @type {WebSocket?}
     */
    this.ws = null;
    this.wsLastMessageReceived = 0;
    /**
     * Whether to connect to other peers or not
     * @type {boolean}
     */
    this.shouldConnect = connect;

    this._resyncInterval = 0;
    if (resyncInterval > 0) {
      this._resyncInterval = /** @type {any} */ setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // resend sync step 1
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, Message.sync);
          syncProtocol.writeSyncStep1(encoder, doc);
          this.ws.send(encoding.toUint8Array(encoder));
        }
      }, resyncInterval);
    }

    this._updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, Message.sync);
        syncProtocol.writeUpdate(encoder, update);
        broadcastMessage(this, encoding.toUint8Array(encoder));
      }
    };
    this.doc.on('update', this._updateHandler);

    this._awarenessUpdateHandler = ({ added, updated, removed }: any) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, Message.awareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      broadcastMessage(this, encoding.toUint8Array(encoder));
    };
    this._unloadHandler = () => {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        [doc.clientID],
        'window unload'
      );
    };
    if (isBrowser) {
      window.addEventListener('unload', this._unloadHandler);
    } else if (typeof process !== 'undefined') {
      process.on('exit', this._unloadHandler);
    }
    awareness.on('update', this._awarenessUpdateHandler);
    this._checkInterval = /** @type {any} */ setInterval(() => {
      if (
        this.wsconnected &&
        messageReconnectTimeout < Date.now() - this.wsLastMessageReceived
      ) {
        // no message received in a long time - not even your own awareness
        // updates (which are updated every 15 seconds)
        /** @type {WebSocket} */ this.ws.close();
      }
    }, messageReconnectTimeout / 10);
    if (connect) {
      this.connect();
    }
  }

  /**
   * @type {boolean}
   */
  get synced() {
    return this._synced;
  }

  set synced(state) {
    if (this._synced !== state) {
      this._synced = state;
      this.emit('synced', [state]);
      this.emit('sync', [state]);
    }
  }

  override destroy() {
    if (this._resyncInterval !== 0) {
      clearInterval(this._resyncInterval);
    }
    clearInterval(this._checkInterval);
    this.disconnect();
    if (isBrowser) {
      window.removeEventListener('unload', this._unloadHandler);
    } else if (typeof process !== 'undefined') {
      process.off('exit', this._unloadHandler);
    }
    this.awareness.off('update', this._awarenessUpdateHandler);
    this.doc.off('update', this._updateHandler);
    super.destroy();
  }

  disconnect() {
    this.shouldConnect = false;

    if (this.ws !== null) {
      this.ws.close();
    }
  }

  connect() {
    this.shouldConnect = true;
    if (!this.wsconnected && this.ws === null) {
      setupWS(this);
    }
  }
}
