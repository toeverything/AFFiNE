import { net, protocol, session } from 'electron';
import { join } from 'path';

import { CLOUD_BASE_URL } from './config';
import { logger } from './logger';
import { getCookie } from './main-window';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'assets',
    privileges: {
      secure: false,
      corsEnabled: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
    },
  },
]);

const NETWORK_REQUESTS = ['/api', '/ws', '/socket.io', '/graphql'];
const webStaticDir = join(__dirname, '../resources/web-static');

function isNetworkResource(pathname: string) {
  return NETWORK_REQUESTS.some(opt => pathname.startsWith(opt));
}

async function handleFileRequest(request: Request) {
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
    return handleFileRequest(request);
  });

  protocol.handle('assets', request => {
    return handleFileRequest(request);
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
    (async () => {
      const url = new URL(details.url);
      const pathname = url.pathname;
      // if sending request to the cloud, attach the session cookie
      if (isNetworkResource(pathname)) {
        const cookie = await getCookie(CLOUD_BASE_URL);
        const cookieString = cookie.map(c => `${c.name}=${c.value}`).join('; ');
        details.requestHeaders['cookie'] = cookieString;
      }
      callback({
        cancel: false,
        requestHeaders: details.requestHeaders,
      });
    })().catch(e => {
      logger.error('failed to attach cookie', e);
      callback({
        cancel: false,
        requestHeaders: details.requestHeaders,
      });
    });
  });
}
