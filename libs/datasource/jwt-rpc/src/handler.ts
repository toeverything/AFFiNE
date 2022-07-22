import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as authProtocol from 'y-protocols/auth';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';

import { WebsocketProvider } from './provider';

const permissionDeniedHandler = (provider: WebsocketProvider, reason: string) =>
    console.warn(`Permission denied to access ${provider.url}.\n${reason}`);

export enum Message {
    sync = 0,
    queryAwareness,
    awareness,
    auth,
}

export type MessageCallback = (
    encoder: encoding.Encoder,
    decoder: decoding.Decoder,
    provider: WebsocketProvider,
    emitSynced: boolean,
    messageType: number
) => void;

export const handler: Record<Message, MessageCallback> = {
    [Message.sync]: (encoder, decoder, provider, emitSynced, messageType) => {
        encoding.writeVarUint(encoder, Message.sync);
        const syncMessageType = syncProtocol.readSyncMessage(
            decoder,
            encoder,
            provider.doc,
            provider
        );
        if (
            emitSynced &&
            syncMessageType === syncProtocol.messageYjsSyncStep2 &&
            !provider.synced
        ) {
            provider.synced = true;
        }
    },
    [Message.queryAwareness]: (
        encoder,
        decoder,
        provider,
        emitSynced,
        messageType
    ) => {
        encoding.writeVarUint(encoder, Message.queryAwareness);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
                provider.awareness,
                Array.from(provider.awareness.getStates().keys())
            )
        );
    },

    [Message.awareness]: (
        encoder,
        decoder,
        provider,
        emitSynced,
        messageType
    ) => {
        awarenessProtocol.applyAwarenessUpdate(
            provider.awareness,
            decoding.readVarUint8Array(decoder),
            provider
        );
    },

    [Message.auth]: (encoder, decoder, provider, emitSynced, messageType) => {
        authProtocol.readAuthMessage(
            decoder,
            provider.doc,
            permissionDeniedHandler
        );
    },
};
