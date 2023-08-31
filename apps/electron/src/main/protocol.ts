import { net, protocol, session } from 'electron';
import { join } from 'path';

import { CLOUD_BASE_URL } from './config';

const NETWORK_REQUESTS = ['/api', '/ws', '/socket.io', '/graphql'];
const webStaticDir = join(__dirname, '../resources/web-static');

function isNetworkResource(pathname: string) {
  return NETWORK_REQUESTS.some(opt => pathname.startsWith(opt));
}

async function handleHttpRequest(request: Request) {
  const clonedRequest = Object.assign(request.clone(), {
    bypassCustomProtocolHandlers: true,
  });
  const urlObject = new URL(request.url);
  if (isNetworkResource(urlObject.pathname)) {
    // just pass through (proxy)
    return net.fetch(CLOUD_BASE_URL + urlObject.pathname, clonedRequest);
  } else {
    // this will be file types (in the web-static folder)
    let filepath = '';
    // if is a file type, load the file in resources
    if (urlObject.pathname.split('/').at(-1)?.includes('.')) {
      filepath = join(webStaticDir, decodeURIComponent(urlObject.pathname));
    } else {
      // else, fallback to load the index.html instead
      filepath = join(webStaticDir, 'index.html');
    }
    return net.fetch('file://' + filepath, clonedRequest);
  }
}

export function registerProtocol() {
  protocol.handle('file', request => {
    return handleHttpRequest(request);
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
