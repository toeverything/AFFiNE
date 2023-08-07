import { net, protocol, session } from 'electron';
import { join } from 'path';

import { CLOUD_API_URL } from './config';
import { logger } from './logger';

const NETWORK_REQUESTS = ['/api', '/socket.io', '/graphql'];

export function registerProtocol() {
  // it seems that there is some issue to postMessage between renderer with custom protocol & helper process
  protocol.handle('file', request => {
    const url = request.url.replace(/^file:\/\//, '');
    let realpath = decodeURIComponent(url);

    const webStaticDir = join(__dirname, '../resources/web-static');
    // ALL URLs should start with ./
    if (url.startsWith('./')) {
      if (NETWORK_REQUESTS.some(path => url.startsWith('.' + path))) {
        const realUrl = CLOUD_API_URL + url.substring(1);
        logger.info('proxy', request.url, 'to', realUrl);
        return net.fetch(realUrl, {
          body: request.body,
          method: request.method,
          headers: request.headers,
        });
      }
      // if is a file type, load the file in resources
      else if (url.split('/').at(-1)?.includes('.')) {
        realpath = join(webStaticDir, decodeURIComponent(url));
      } else {
        // else, fallback to load the index.html instead
        realpath = join(webStaticDir, 'index.html');
      }
    }
    return net.fetch('file://' + realpath, {
      // we need this otherwise the request will be handled recursively
      bypassCustomProtocolHandlers: true,
    });
  });

  // hack for CORS
  // todo: should use a whitelist
  session.defaultSession.webRequest.onHeadersReceived(
    (responseDetails, callback) => {
      const { responseHeaders } = responseDetails;
      if (responseHeaders) {
        delete responseHeaders['access-control-allow-origin'];
        delete responseHeaders['access-control-allow-methods'];
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = [
          'GET',
          'POST',
          'PUT',
          'DELETE',
          'OPTIONS',
        ];
      }

      callback({ responseHeaders });
    }
  );
}
