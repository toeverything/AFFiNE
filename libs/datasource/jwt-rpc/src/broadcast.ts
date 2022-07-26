import * as Y from 'yjs';
import * as bc from 'lib0/broadcastchannel';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';

import { Message } from './handler';
import { readMessage } from './processor';
import { WebsocketProvider } from './provider';

export const registerBroadcastSubscriber = (
    provider: WebsocketProvider,
    awareness: awarenessProtocol.Awareness,
    document: Y.Doc
) => {
    const channel = provider.broadcastChannel;

    const subscriber = (data: ArrayBuffer, origin: any) => {
        if (origin !== provider) {
            const encoder = readMessage(provider, new Uint8Array(data), false);
            if (encoding.length(encoder) > 1) {
                bc.publish(channel, encoding.toUint8Array(encoder), provider);
            }
        }
    };

    bc.subscribe(channel, subscriber);
    let connected = true;

    // send sync step1 to bc
    // write sync step 1
    const encoderSync = encoding.createEncoder();
    encoding.writeVarUint(encoderSync, Message.sync);
    syncProtocol.writeSyncStep1(encoderSync, document);
    bc.publish(channel, encoding.toUint8Array(encoderSync), this);
    // broadcast local state
    const encoderState = encoding.createEncoder();
    encoding.writeVarUint(encoderState, Message.sync);
    syncProtocol.writeSyncStep2(encoderState, document);
    bc.publish(channel, encoding.toUint8Array(encoderState), this);
    // write queryAwareness
    const encoderAwarenessQuery = encoding.createEncoder();
    encoding.writeVarUint(encoderAwarenessQuery, Message.queryAwareness);
    bc.publish(channel, encoding.toUint8Array(encoderAwarenessQuery), this);
    // broadcast local awareness state
    const encoderAwarenessState = encoding.createEncoder();
    encoding.writeVarUint(encoderAwarenessState, Message.awareness);
    encoding.writeVarUint8Array(
        encoderAwarenessState,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [document.clientID])
    );
    bc.publish(channel, encoding.toUint8Array(encoderAwarenessState), this);

    const broadcastMessage = (buf: ArrayBuffer) => {
        if (connected) bc.publish(channel, buf, provider);
    };

    const disconnect = () => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, Message.awareness);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
                awareness,
                [document.clientID],
                new Map()
            )
        );
        broadcastMessage(encoding.toUint8Array(encoder));
        if (connected) {
            bc.unsubscribe(channel, subscriber);
            connected = false;
        }
    };

    return { broadcastMessage, disconnect };
};
