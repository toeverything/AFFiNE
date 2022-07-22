import * as Y from 'yjs';

import { Observable } from 'lib0/observable';
import * as url from 'lib0/url';

import * as awarenessProtocol from 'y-protocols/awareness';

import { handler } from './handler';
import {
    registerBroadcastSubscriber,
    registerUpdateHandler,
    registerWebsocket,
} from './connector';

/**
 * Websocket Provider for Yjs. Creates a websocket connection to sync the shared document.
 * The document name is attached to the provided url. I.e. the following example
 * creates a websocket connection to http://localhost:3000/my-document-name
 *
 * @example
 *   import * as Y from 'yjs'
 *   import { WebsocketProvider } from 'jwt-rpc'
 *   const doc = new Y.Doc()
 *   const provider = new WebsocketProvider('http://localhost:3000', 'my-document-name', doc)
 */
export class WebsocketProvider extends Observable<string> {
    maxBackOffTime: number;
    url: string;
    roomName: string;

    awareness: awarenessProtocol.Awareness;
    doc: Y.Doc;

    wsUnsuccessfulReconnects: number;
    private _synced: boolean;

    broadcastChannel: string;
    private _broadcast?: {
        broadcastMessage: (buf: ArrayBuffer) => void;
        disconnect: () => void;
    };

    private _websocket?: {
        broadcastMessage: (buf: ArrayBuffer) => void;
        disconnect: () => void;
    };

    private _updateHandlerDestroy: () => void;

    constructor(
        token: string,
        serverUrl: string,
        roomName: string,
        doc: Y.Doc,
        {
            awareness = new awarenessProtocol.Awareness(doc),
            params = {},
            resyncInterval = -1,
            maxBackOffTime = 2500,
        } = {}
    ) {
        super();

        this.roomName = roomName;
        // ensure that url is always ends with /
        while (serverUrl[serverUrl.length - 1] === '/') {
            serverUrl = serverUrl.slice(0, serverUrl.length - 1);
        }
        this.broadcastChannel = serverUrl + '/' + roomName;
        const encodedParams = url.encodeQueryParams(params);
        this.url =
            this.broadcastChannel +
            (encodedParams.length === 0 ? '' : '?' + encodedParams);

        this.awareness = awareness;
        this.doc = doc;

        this.maxBackOffTime = maxBackOffTime;
        this.wsUnsuccessfulReconnects = 0;

        this._synced = false;

        this._websocket = registerWebsocket(this, token, resyncInterval);
        // TODO: The current implementation will cause a broadcast storm, and then re-implement one, or just go websocket synchronization
        // this._broadcast = registerBroadcastSubscriber(
        //     this,
        //     this.awareness,
        //     this.doc
        // );

        this._updateHandlerDestroy = registerUpdateHandler(
            this,
            awareness,
            doc,
            buf => {
                this._websocket?.broadcastMessage(buf);
                this._broadcast?.broadcastMessage(buf);
            }
        );
    }

    get messageHandlers() {
        return handler;
    }

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
        if (this._broadcast) {
            const disconnect = this._broadcast.disconnect;
            this._broadcast = undefined;
            disconnect();
        }

        if (this._websocket) {
            const disconnect = this._websocket.disconnect;
            this._websocket = undefined;
            disconnect();
        }

        this._updateHandlerDestroy?.();
        super.destroy();
    }
}
