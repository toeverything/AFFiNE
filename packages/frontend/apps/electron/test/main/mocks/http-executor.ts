import http from 'node:https';

import { HttpExecutor } from 'builder-util-runtime';
import type { ClientRequest } from 'electron';

/**
 * For testing and same as:
 * https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/electronHttpExecutor.ts
 */
export class MockedHttpExecutor extends HttpExecutor<ClientRequest> {
  createRequest(
    options: any,
    callback: (response: any) => void
  ): ClientRequest {
    if (options.headers && options.headers.Host) {
      // set host value from headers.Host
      options.host = options.headers.Host;
      // remove header property 'Host', if not removed causes net::ERR_INVALID_ARGUMENT exception
      delete options.headers.Host;
    }

    const request = http.request(options);
    request.on('response', callback);
    return request as unknown as ClientRequest;
  }
}
