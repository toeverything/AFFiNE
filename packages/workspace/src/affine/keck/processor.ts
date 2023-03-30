import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

import type { BroadcastProvider } from './broadcast.js';
import type { Message } from './handler.js';
import type { KeckProvider } from './keck.js';

export const readMessage = (
  provider: KeckProvider | BroadcastProvider,
  buf: Uint8Array,
  emitSynced: boolean
): encoding.Encoder => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder) as Message;
  const messageHandler = provider.messageHandlers[messageType];
  if (messageHandler) {
    messageHandler(encoder, decoder, provider, emitSynced, messageType);
  } else {
    console.error('Unable to compute message');
  }
  return encoder;
};
