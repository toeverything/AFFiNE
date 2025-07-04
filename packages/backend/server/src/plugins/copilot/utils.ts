import { Readable } from 'node:stream';

import type { Request } from 'express';

import { readBufferWithLimit } from '../../base';
import { MAX_EMBEDDABLE_SIZE } from './types';

export function readStream(
  readable: Readable,
  maxSize = MAX_EMBEDDABLE_SIZE
): Promise<Buffer> {
  return readBufferWithLimit(readable, maxSize);
}

type RequestClosedCallback = (isAborted: boolean) => void;
type SignalReturnType = {
  signal: AbortSignal;
  onConnectionClosed: (cb: RequestClosedCallback) => void;
};

export function getSignal(req: Request): SignalReturnType {
  const controller = new AbortController();

  let isAborted = true;
  let callback: ((isAborted: boolean) => void) | undefined = undefined;

  const onSocketEnd = () => {
    isAborted = false;
  };
  const onSocketClose = (hadError: boolean) => {
    req.socket.off('end', onSocketEnd);
    req.socket.off('close', onSocketClose);
    const aborted = hadError || isAborted;
    if (aborted) {
      controller.abort();
    }

    callback?.(aborted);
  };

  req.socket.on('end', onSocketEnd);
  req.socket.on('close', onSocketClose);

  return {
    signal: controller.signal,
    onConnectionClosed: cb => (callback = cb),
  };
}
