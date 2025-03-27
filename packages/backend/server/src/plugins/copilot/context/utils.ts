import { Readable } from 'node:stream';

import { readBufferWithLimit } from '../../../base';
import { MAX_EMBEDDABLE_SIZE } from './types';

export class GqlSignal implements AsyncDisposable {
  readonly abortController = new AbortController();

  get signal() {
    return this.abortController.signal;
  }

  async [Symbol.asyncDispose]() {
    this.abortController.abort();
  }
}

export function readStream(
  readable: Readable,
  maxSize = MAX_EMBEDDABLE_SIZE
): Promise<Buffer> {
  return readBufferWithLimit(readable, maxSize);
}
