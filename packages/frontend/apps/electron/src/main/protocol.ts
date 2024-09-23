import { join } from 'node:path';

import { net, protocol, session } from 'electron';

import { CLOUD_BASE_URL } from './config';
import { logger } from './logger';
import { isOfflineModeEnabled } from './utils';
import { getCookies } from './windows-manager';

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

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'file',
    privileges: {
      secure: false,
      corsEnabled: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
      stream: true,
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
    return net.fetch(
      CLOUD_BASE_URL + urlObject.pathname + urlObject.search,
      clonedRequest
    );
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

    const sameSite =
      url.host === new URL(CLOUD_BASE_URL).host || protocol === 'file:';

    // offline whitelist
    // 1. do not block non-api request for http://localhost || file:// (local dev assets)
    // 2. do not block devtools
    // 3. block all other requests
    const blocked = (() => {
      if (!isOfflineModeEnabled()) {
        return false;
      }
      if (
        (protocol === 'file:' || origin.startsWith('http://localhost')) &&
        !isNetworkResource(pathname)
      ) {
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

    // session cookies are set to file:// on production
    // if sending request to the cloud, attach the session cookie (to affine cloud server)
    if (isNetworkResource(pathname) && sameSite) {
      const cookie = getCookies();
      if (cookie) {
        const cookieString = cookie.map(c => `${c.name}=${c.value}`).join('; ');
        details.requestHeaders['cookie'] = cookieString;
      }

      // add the referer and origin headers
      details.requestHeaders['referer'] ??= CLOUD_BASE_URL;
      details.requestHeaders['origin'] ??= CLOUD_BASE_URL;
    }
    callback({
      cancel: false,
      requestHeaders: details.requestHeaders,
    });
  });
}
