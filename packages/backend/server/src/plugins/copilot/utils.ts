import { Readable } from 'node:stream';

import type { Request } from 'express';

import { OneMB, readBufferWithLimit } from '../../base';
import type { PromptTools } from './providers';
import type { ToolsConfig } from './types';

export const MAX_EMBEDDABLE_SIZE = 50 * OneMB;

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

  let hasEnded = false;
  let callback: ((isAborted: boolean) => void) | undefined = undefined;

  const onSocketEnd = () => {
    hasEnded = true;
  };
  const onSocketClose = (hadError: boolean) => {
    req.socket.off('end', onSocketEnd);
    req.socket.off('close', onSocketClose);
    // NOTE: the connection is considered abnormally interrupted:
    // 1. there is an error when the socket is closed.
    // 2. the connection is closed directly without going through the normal end process (the client disconnects actively).
    const aborted = hadError || !hasEnded;
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

export function getTools(
  tools?: PromptTools | null,
  toolsConfig?: ToolsConfig
) {
  if (!tools || !toolsConfig) {
    return tools;
  }
  let result: PromptTools = tools;
  (Object.keys(toolsConfig) as Array<keyof ToolsConfig>).forEach(key => {
    const value = toolsConfig[key];
    switch (key) {
      case 'searchWorkspace':
        if (value === false) {
          result = result.filter(tool => {
            return tool !== 'docKeywordSearch' && tool !== 'docSemanticSearch';
          });
        }
        break;
      case 'readingDocs':
        if (value === false) {
          result = result.filter(tool => {
            return tool !== 'docRead';
          });
        }
        break;
    }
  });
  return result;
}
