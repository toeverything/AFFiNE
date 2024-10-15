import { join } from 'node:path';

import { net, protocol, session } from 'electron';

import { CLOUD_BASE_URL, DEV_SERVER_URL } from './config';
import { logger } from './logger';
import { isOfflineModeEnabled } from './utils';

const NETWORK_REQUESTS = ['/api', '/ws', '/socket.io', '/graphql'];
const webStaticDir = join(__dirname, '../resources/web-static');

function isNetworkResource(pathname: string) {
  return NETWORK_REQUESTS.some(opt => pathname.startsWith(opt));
}

async function fetchLocalResource(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  // this will be file types (in the web-static folder)
  let filepath = '';
  // if is a file type, load the file in resources
  if (pathname.split('/').at(-1)?.includes('.')) {
    filepath = join(webStaticDir, decodeURIComponent(pathname));
  } else {
    // else, fallback to load the index.html instead
    filepath = join(webStaticDir, 'index.html');
  }
  return net.fetch('file://' + filepath, request);
}

async function handleHttpRequest(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const sameSite = url.host === new URL(CLOUD_BASE_URL).host;

  console.log('request', request.url);

  const isStaticResource = sameSite && !isNetworkResource(pathname);
  if (isStaticResource) {
    return fetchLocalResource(request);
  }
  return net.fetch(request, {
    bypassCustomProtocolHandlers: true,
  });
}

// mainly for loading sourcemap
// seems handle for http/https does not work for sourcemaps
async function handleAssetRequest(request: Request) {
  return fetchLocalResource(request);
}

export function registerProtocol() {
  const isSecure = CLOUD_BASE_URL.startsWith('https://');

  // do not proxy request when DEV_SERVER_URL is set (for local dev)
  if (!DEV_SERVER_URL) {
    protocol.handle(isSecure ? 'https' : 'http', request => {
      return handleHttpRequest(request);
    });

    protocol.handle('assets', request => {
      return handleAssetRequest(request);
    });
  }

  // hack for CORS
  // todo: should use a whitelist
  session.defaultSession.webRequest.onHeadersReceived(
    (responseDetails, callback) => {
      const { responseHeaders } = responseDetails;
      if (responseHeaders) {
        // replace SameSite=Lax with SameSite=None
        const originalCookie =
          responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];

        if (originalCookie) {
          delete responseHeaders['set-cookie'];
          delete responseHeaders['Set-Cookie'];
          responseHeaders['Set-Cookie'] = originalCookie.map(cookie => {
            let newCookie = cookie.replace(/SameSite=Lax/gi, 'SameSite=None');

            // if the cookie is not secure, set it to secure
            if (!newCookie.includes('Secure')) {
              newCookie = newCookie + '; Secure';
            }
            return newCookie;
          });
        }
      }

      callback({ responseHeaders });
    }
  );

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = new URL(details.url);
    const pathname = url.pathname;
    const protocol = url.protocol;
    const origin = url.origin;

    // offline whitelist
    // 1. do not block non-api request for DEV_SERVER_URL
    // 2. do not block devtools
    // 3. block all other requests
    const blocked = (() => {
      if (!isOfflineModeEnabled()) {
        return false;
      }
      if (origin === DEV_SERVER_URL && !isNetworkResource(pathname)) {
        return false;
      }
      if ('devtools:' === protocol) {
        return false;
      }
      return true;
    })();

    if (blocked) {
      logger.debug('blocked request', details.url);
      callback({
        cancel: true,
      });
      return;
    }

    callback({
      cancel: false,
      requestHeaders: details.requestHeaders,
    });
  });
}
