/**
 * @deprecated Remove this file after we migrate to the new cloud.
 */
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

import type { KeckProvider } from '.';
import type { Message } from './handler.js';

export const readMessage = (
  provider: KeckProvider,
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
