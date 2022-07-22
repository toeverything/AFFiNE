import * as Y from 'yjs';
import * as bc from 'lib0/broadcastchannel';
import * as time from 'lib0/time';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as math from 'lib0/math';

import { WebsocketProvider } from './provider';
import { Message } from './handler';

export const readMessage = (
    provider: WebsocketProvider,
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

export const registerUpdateHandler = (
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

enum WebSocketState {
    disconnected = 0,
    connecting,
    connected,
}

// @todo - this should depend on awareness.outdatedTime
const WEBSOCKET_RECONNECT = 30000;

const _getToken = async (
    remote: string,
    token: string,
    existsProtocol?: string,
    reconnect = 3
) => {
    if (existsProtocol && reconnect > 0) {
        return { protocol: existsProtocol };
    }
    const url = new URL(remote);
    url.protocol = window.location.protocol;
    return fetch(url, { method: 'POST', headers: { token } }).then(r =>
        r.json()
    );
};

export const registerWebsocket = (
    provider: WebsocketProvider,
    token: string,
    resync = -1,
    reconnect = 3,
    existsProtocol?: string
) => {
    let state = WebSocketState.disconnected;
    let lastMessageReceived = 0;

    let websocket: WebSocket | undefined = undefined;

    _getToken(provider.url, token, existsProtocol, reconnect)
        .then(({ protocol }) => {
            websocket = new WebSocket(provider.url, protocol);
            websocket.binaryType = 'arraybuffer';
            state = WebSocketState.connecting;

            provider.synced = false;

            websocket.onmessage = event => {
                lastMessageReceived = time.getUnixTime();
                const encoder = readMessage(
                    provider,
                    new Uint8Array(event.data),
                    true
                );
                if (encoding.length(encoder) > 1) {
                    websocket?.send(encoding.toUint8Array(encoder));
                }
            };
            websocket.onerror = event => {
                provider.emit('connection-error', [event, provider]);
            };
            websocket.onclose = event => {
                provider.emit('connection-close', [event, provider]);
                websocket = undefined;

                if (
                    [
                        WebSocketState.connecting,
                        WebSocketState.connected,
                    ].includes(state)
                ) {
                    state = WebSocketState.disconnected;
                    provider.synced = false;
                    // update awareness (all users except local left)
                    awarenessProtocol.removeAwarenessStates(
                        provider.awareness,
                        Array.from(
                            provider.awareness.getStates().keys()
                        ).filter(client => client !== provider.doc.clientID),
                        provider
                    );
                    provider.emit('status', [{ status: 'disconnected' }]);
                } else {
                    provider.wsUnsuccessfulReconnects++;
                }
                if (reconnect <= 0) {
                    provider.emit('lost-connection', []);
                }
                // Start with no reconnect timeout and increase timeout by
                // using exponential backoff starting with 100ms
                setTimeout(
                    registerWebsocket,
                    math.min(
                        math.pow(2, provider.wsUnsuccessfulReconnects) * 100,
                        provider.maxBackOffTime
                    ),
                    provider,
                    token,
                    resyncInterval,
                    reconnect > 0 ? reconnect - 1 : 3,
                    protocol
                );
            };
            websocket.onopen = () => {
                lastMessageReceived = time.getUnixTime();
                state = WebSocketState.connected;
                provider.wsUnsuccessfulReconnects = 0;
                provider.emit('status', [{ status: 'connected' }]);
                // always send sync step 1 when connected
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, Message.sync);
                syncProtocol.writeSyncStep1(encoder, provider.doc);
                websocket?.send(encoding.toUint8Array(encoder));
                // broadcast local awareness state
                if (provider.awareness.getLocalState() !== null) {
                    const encoderAwarenessState = encoding.createEncoder();
                    encoding.writeVarUint(
                        encoderAwarenessState,
                        Message.awareness
                    );
                    encoding.writeVarUint8Array(
                        encoderAwarenessState,
                        awarenessProtocol.encodeAwarenessUpdate(
                            provider.awareness,
                            [provider.doc.clientID]
                        )
                    );
                    websocket?.send(
                        encoding.toUint8Array(encoderAwarenessState)
                    );
                }
            };

            provider.emit('status', [{ status: 'connecting' }]);
        })
        .catch(err => {
            if (reconnect <= 0) {
                provider.emit('lost-connection', []);
            }
            provider.wsUnsuccessfulReconnects++;
            setTimeout(
                registerWebsocket,
                math.min(
                    math.pow(2, provider.wsUnsuccessfulReconnects) * 100,
                    provider.maxBackOffTime
                ),
                provider,
                token,
                resyncInterval,
                reconnect > 0 ? reconnect - 1 : 3
            );
        });

    let resyncInterval = 0;
    if (resync > 0) {
        resyncInterval = setInterval(() => {
            if (websocket?.readyState === WebSocket.OPEN) {
                // resend sync step 1
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, Message.sync);
                syncProtocol.writeSyncStep1(encoder, provider.doc);
                websocket.send(encoding.toUint8Array(encoder));
            }
        }, resync) as unknown as number;
    }

    const checkInterval = setInterval(() => {
        if (
            state === WebSocketState.connected &&
            WEBSOCKET_RECONNECT < time.getUnixTime() - lastMessageReceived
        ) {
            // no message received in a long time - not even your own awareness
            // updates (which are updated every 15 seconds)
            websocket?.close();
        }
    }, WEBSOCKET_RECONNECT / 10);

    const broadcastMessage = (buf: ArrayBuffer) => {
        if (state === WebSocketState.connected) {
            websocket?.send(buf);
        }
    };

    const disconnect = () => {
        if (websocket != null) {
            websocket.close();
            websocket = undefined;
            state = WebSocketState.disconnected;
            if (resyncInterval !== 0) {
                clearInterval(resyncInterval);
            }
            clearInterval(checkInterval);
        }
    };

    return { broadcastMessage, disconnect };
};
