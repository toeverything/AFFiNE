import * as encoding from 'lib0/encoding';
import * as math from 'lib0/math';
import * as time from 'lib0/time';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';

import { Message } from './handler';
import { readMessage } from './processor';
import { WebsocketProvider } from './provider';

enum WebSocketState {
    disconnected = 0,
    connecting,
    connected,
}

// @todo - this should depend on awareness.outdatedTime
const WEBSOCKET_RECONNECT = 30000;

const GET_TOKEN_BASELINE_TIMEOUT = 500;
const _getToken = async (
    remote: string,
    token: string,
    existsProtocol?: string,
    reconnect = 3,
    timeout = 500
) => {
    if (existsProtocol && reconnect > 0) {
        return { protocol: existsProtocol };
    }
    const url = new URL(remote);
    url.protocol = window.location.protocol;
    const controller = new AbortController();
    const id = setTimeout(
        () => controller.abort(),
        GET_TOKEN_BASELINE_TIMEOUT + timeout
    );
    const resp = await fetch(url, {
        method: 'POST',
        headers: { token },
        signal: controller.signal,
    });

    clearTimeout(id);

    return resp.json();
};

const _getTimeout = (provider: WebsocketProvider) =>
    math.min(
        math.pow(2, provider.wsUnsuccessfulReconnects) * 100,
        provider.maxBackOffTime
    );

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

    _getToken(
        provider.url,
        token,
        existsProtocol,
        reconnect,
        _getTimeout(provider)
    )
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
                if (reconnect <= 0) provider.emit('lost-connection', []);
                // Start with no reconnect timeout and increase timeout by
                // using exponential backoff starting with 100ms
                setTimeout(
                    registerWebsocket,
                    _getTimeout(provider),
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
            provider.emit('lost-connection', []);
            provider.wsUnsuccessfulReconnects++;
            setTimeout(
                registerWebsocket,
                _getTimeout(provider),
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
