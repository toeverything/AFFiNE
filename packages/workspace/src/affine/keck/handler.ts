import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';

import type { KeckProvider } from '.';

export enum Message {
  sync = 0,
  awareness = 1,
  queryAwareness = 3,
}

export type MessageCallback = (
  encoder: encoding.Encoder,
  decoder: decoding.Decoder,
  provider: KeckProvider,
  emitSynced: boolean,
  messageType: number
) => void;

export const handler: Record<Message, MessageCallback> = {
  [Message.sync]: (encoder, decoder, provider, emitSynced) => {
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
  [Message.awareness]: (_encoder, decoder, provider) => {
    awarenessProtocol.applyAwarenessUpdate(
      provider.awareness,
      decoding.readVarUint8Array(decoder),
      provider
    );
  },
  [Message.queryAwareness]: (encoder, _decoder, provider) => {
    encoding.writeVarUint(encoder, Message.awareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        provider.awareness,
        Array.from(provider.awareness.getStates().keys())
      )
    );
  },
};
