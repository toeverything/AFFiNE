import WebSocket = require('ws');
import http = require('http');
import Y = require('yjs');
import lib0 = require('lib0');
import syncProtocol = require('y-protocols/sync');

const { encoding, decoding, map } = lib0;

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

// disable gc when using snapshots!
const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';

const docs: Map<string, WSSharedDoc> = new Map();

const messageSync = 0;

const updateHandler = (update: Uint8Array, origin: any, doc: WSSharedDoc) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    doc.conns.forEach((_, conn) => send(doc, conn, message));
};
export class WSSharedDoc extends Y.Doc {
    name: string;
    conns: Map<any, any>;

    constructor(name: string) {
        super({ gc: gcEnabled });
        this.name = name;
        // Maps from conn to set of controlled user ids. Delete all user ids from awareness when this conn is closed
        this.conns = new Map();

        this.on('update', updateHandler);
    }
}

// Gets a Y.Doc by name, whether in memory or on disk
const getYDoc = (docname: string, gc = true): WSSharedDoc =>
    map.setIfUndefined(docs, docname, () => {
        const doc = new WSSharedDoc(docname);
        doc.gc = gc;
        docs.set(docname, doc);
        return doc;
    });

const closeConn = (doc: WSSharedDoc, conn: any) => {
    if (doc.conns.has(conn)) {
        doc.conns.delete(conn);
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
    socket.on('message', (message: ArrayBuffer) => {
        try {
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);
            switch (messageType) {
                case messageSync:
                    encoding.writeVarUint(encoder, messageSync);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                    if (encoding.length(encoder) > 1) {
                        send(doc, socket, encoding.toUint8Array(encoder));
                    }
                    break;
            }
        } catch (err) {
            console.error(err);
            doc.emit('error', [err]);
        }
    });

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
        console.log('sync step 0', encoding.toUint8Array(encoder));
        syncProtocol.writeSyncStep1(encoder, doc);
        send(doc, socket, encoding.toUint8Array(encoder));
        console.log('sync step 1 sent', encoding.toUint8Array(encoder));
    }
};
