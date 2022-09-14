import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { Message } from './handler';
import { KeckProvider } from './keckprovider';
import { WebsocketProvider } from './wsprovider';

export const readMessage = (
    provider: WebsocketProvider | KeckProvider,
    buf: Uint8Array,
    emitSynced: boolean
): encoding.Encoder => {
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder) as Message;
    const messageHandler = provider.messageHandlers[messageType];
    if (/** @type {any} */ messageHandler) {
        messageHandler(encoder, decoder, provider, emitSynced, messageType);
    } else {
        console.error('Unable to compute message');
    }
    return encoder;
};

export const registerWsUpdateHandler = (
    provider: WebsocketProvider,
    awareness: awarenessProtocol.Awareness,
    doc: Y.Doc,
    broadcastMessage: (buf: ArrayBuffer) => void
) => {
    const beforeUnloadHandler = () => {
        awarenessProtocol.removeAwarenessStates(
            awareness,
            [doc.clientID],
            'window unload'
        );
    };

    const awarenessUpdateHandler = ({ added, updated, removed }: any) => {
        const changedClients = added.concat(updated).concat(removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, Message.awareness);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        broadcastMessage(encoding.toUint8Array(encoder));
    };

    //  Listens to Yjs updates and sends them to remote peers (ws and broadcastchannel)
    const documentUpdateHandler = (update: Uint8Array, origin: any) => {
        if (origin !== provider) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, Message.sync);
            syncProtocol.writeUpdate(encoder, update);
            broadcastMessage(encoding.toUint8Array(encoder));
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', beforeUnloadHandler);
    } else if (typeof process !== 'undefined') {
        process.on('exit', beforeUnloadHandler);
    }

    awareness.on('update', awarenessUpdateHandler);
    doc.on('update', documentUpdateHandler);
    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
        } else if (typeof process !== 'undefined') {
            process.off('exit', beforeUnloadHandler);
        }

        awareness.off('update', awarenessUpdateHandler);
        doc.off('update', documentUpdateHandler);
    };
};

export const registerKeckUpdateHandler = (
    provider: KeckProvider,
    doc: Y.Doc,
    broadcastMessage: (buf: ArrayBuffer) => void
) => {
    //  Listens to Yjs updates and sends them to remote peers (ws and broadcastchannel)
    const documentUpdateHandler = (update: Uint8Array, origin: any) => {
        if (origin !== provider) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, Message.sync);
            syncProtocol.writeUpdate(encoder, update);
            broadcastMessage(encoding.toUint8Array(encoder));
        }
    };

    doc.on('update', documentUpdateHandler);
    return () => {
        doc.off('update', documentUpdateHandler);
    };
};
