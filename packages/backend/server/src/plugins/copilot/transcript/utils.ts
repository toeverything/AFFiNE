import { Readable } from 'node:stream';

import { readBufferWithLimit } from '../../../base';
import { MAX_TRANSCRIPTION_SIZE } from './types';

export function readStream(
  readable: Readable,
  maxSize = MAX_TRANSCRIPTION_SIZE
): Promise<Buffer> {
  return readBufferWithLimit(readable, maxSize);
}
