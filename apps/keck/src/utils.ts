import WebSocket = require('ws');
import http = require('http');
import Y = require('yjs');
import lib0 = require('lib0');
import awarenessProtocol = require('y-protocols/awareness');
import syncProtocol = require('y-protocols/sync');
// import { getPersistenceStorage } from './persistence';

const { encoding, decoding, mutex, map } = lib0;

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

// disable gc when using snapshots!
const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';

type Persistence =
    | ((arg0: string, arg1: WSSharedDoc) => Promise<any>)
    | undefined;
const persistence: Persistence = null; // getPersistenceStorage('./affine');

const docs: Map<string, WSSharedDoc> = new Map();

const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2

const updateHandler = (update: Uint8Array, origin: any, doc: WSSharedDoc) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    doc.conns.forEach((_, conn) => send(doc, conn, message));
};

type AwarenessEvent = {
    added: Array<number>;
    updated: Array<number>;
    removed: Array<number>;
};

export class WSSharedDoc extends Y.Doc {
    name: string;
    mux: lib0.mutex.mutex;
    conns: Map<any, any>;
    awareness: awarenessProtocol.Awareness;
    /**
     * @param {string} name
     */
    constructor(name: string) {
        super({ gc: gcEnabled });
        this.name = name;
        this.mux = mutex.createMutex();
        /**
         * Maps from conn to set of controlled user ids. Delete all user ids from awareness when this conn is closed
         * @type {Map<Object, Set<number>>}
         */
        this.conns = new Map();
        /**
         * @type {awarenessProtocol.Awareness}
         */
        this.awareness = new awarenessProtocol.Awareness(this);
        this.awareness.setLocalState(null);

        const awarenessChangeHandler = (
            { added, updated, removed }: AwarenessEvent,
            conn: object | null
        ) => {
            const changedClients = added.concat(updated, removed);
            if (conn !== null) {
                const connControlledIds: Set<number> = this.conns.get(conn);
                if (connControlledIds !== undefined) {
                    added.forEach(clientId => {
                        connControlledIds.add(clientId);
                    });
                    removed.forEach(clientId => {
                        connControlledIds.delete(clientId);
                    });
                }
            }
            // broadcast awareness update
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageAwareness);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(
                    this.awareness,
                    changedClients
                )
            );
            const buff = encoding.toUint8Array(encoder);
            this.conns.forEach((_, c) => {
                send(this, c, buff);
            });
        };
        this.awareness.on('update', awarenessChangeHandler);
        this.on('update', updateHandler);
    }
}

// Gets a Y.Doc by name, whether in memory or on disk
const getYDoc = (docname: string, gc = true): WSSharedDoc =>
    map.setIfUndefined(docs, docname, () => {
        const doc = new WSSharedDoc(docname);
        doc.gc = gc;
        if (persistence !== null) {
            persistence(docname, doc);
        }
        docs.set(docname, doc);
        return doc;
    });

const messageListener = (conn: any, doc: WSSharedDoc, message: Uint8Array) => {
    try {
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);
        switch (messageType) {
            case messageSync:
                encoding.writeVarUint(encoder, messageSync);
                syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) {
                    send(doc, conn, encoding.toUint8Array(encoder));
                }
                break;
            case messageAwareness: {
                awarenessProtocol.applyAwarenessUpdate(
                    doc.awareness,
                    decoding.readVarUint8Array(decoder),
                    conn
                );
                break;
            }
        }
    } catch (err) {
        console.error(err);
        doc.emit('error', [err]);
    }
};

const closeConn = (doc: WSSharedDoc, conn: any) => {
    if (doc.conns.has(conn)) {
        const controlledIds: Set<number> = doc.conns.get(conn);
        doc.conns.delete(conn);
        awarenessProtocol.removeAwarenessStates(
            doc.awareness,
            Array.from(controlledIds),
            null
        );
        if (doc.conns.size === 0 && persistence !== null) {
            // if persisted, we store state and destroy ydocument
            persistence(doc.name, doc).then(() => {
                doc.destroy();
            });
            docs.delete(doc.name);
        }
    }
    conn.close();
};

const send = (doc: WSSharedDoc, conn: any, m: Uint8Array) => {
    if (
        conn.readyState !== wsReadyStateConnecting &&
        conn.readyState !== wsReadyStateOpen
    ) {
        closeConn(doc, conn);
    }
    try {
        conn.send(m, (/** @param {any} err */ err: any) => {
            err != null && closeConn(doc, conn);
        });
    } catch (e) {
        closeConn(doc, conn);
    }
};

export const handleConnection = (
    socket: WebSocket.WebSocket,
    request: http.IncomingMessage,
    docName: string
) => {
    const gc = true;
    socket.binaryType = 'arraybuffer';
    // get doc, initialize if it does not exist yet
    const doc = getYDoc(docName, gc);
    doc.conns.set(socket, new Set());
    // listen and reply to events
    socket.on('message', (message: ArrayBuffer) =>
        messageListener(socket, doc, new Uint8Array(message))
    );

    // Check if connection is still alive
    let pongReceived = true;
    const pingInterval = setInterval(() => {
        if (!pongReceived) {
            if (doc.conns.has(socket)) {
                closeConn(doc, socket);
            }
            clearInterval(pingInterval);
        } else if (doc.conns.has(socket)) {
            pongReceived = false;
            try {
                socket.ping();
            } catch (e) {
                closeConn(doc, socket);
                clearInterval(pingInterval);
            }
        }
    }, 30 * 1000);
    socket.on('close', () => {
        closeConn(doc, socket);
        clearInterval(pingInterval);
    });
    socket.on('pong', () => {
        pongReceived = true;
    });
    // put the following in a variables in a block so the interval handlers don't keep in in
    // scope
    {
        // send sync step 1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeSyncStep1(encoder, doc);
        send(doc, socket, encoding.toUint8Array(encoder));
        const awarenessStates = doc.awareness.getStates();
        if (awarenessStates.size > 0) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageAwareness);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(
                    doc.awareness,
                    Array.from(awarenessStates.keys())
                )
            );
            send(doc, socket, encoding.toUint8Array(encoder));
        }
    }
};
