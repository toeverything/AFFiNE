import { net, protocol, session } from 'electron';
import { join } from 'path';

import { CLOUD_BASE_URL } from './config';
import { setCookie } from './main-window';
import { simpleGet } from './utils';

const NETWORK_REQUESTS = ['/api', '/ws', '/socket.io', '/graphql'];
const webStaticDir = join(__dirname, '../resources/web-static');

function isNetworkResource(pathname: string) {
  return NETWORK_REQUESTS.some(opt => pathname.startsWith(opt));
}

async function handleHttpRequest(request: Request) {
  const clonedRequest = Object.assign(request.clone(), {
    bypassCustomProtocolHandlers: true,
  });
  const { pathname, origin } = new URL(request.url);
  if (
    !origin.startsWith(CLOUD_BASE_URL) ||
    isNetworkResource(pathname) ||
    process.env.DEV_SERVER_URL // when debugging locally
  ) {
    // note: I don't find a good way to get over with 302 redirect
    // by default in net.fetch, or don't know if there is a way to
    // bypass http request handling to browser instead ...
    if (pathname.startsWith('/api/auth/callback')) {
      const originResponse = await simpleGet(request.url);
      // hack: use window.webContents.session.cookies to set cookies
      // since return set-cookie header in response doesn't work here
      for (const [, cookie] of originResponse.headers.filter(
        p => p[0] === 'set-cookie'
      )) {
        await setCookie(origin, cookie);
      }
      return new Response(originResponse.body, {
        headers: originResponse.headers,
        status: originResponse.statusCode,
      });
    } else {
      // just pass through (proxy)
      return net.fetch(request.url, clonedRequest);
    }
  } else {
    // this will be file types (in the web-static folder)
    let filepath = '';
    // if is a file type, load the file in resources
    if (pathname.split('/').at(-1)?.includes('.')) {
      filepath = join(webStaticDir, decodeURIComponent(pathname));
    } else {
      // else, fallback to load the index.html instead
      filepath = join(webStaticDir, 'index.html');
    }
    return net.fetch('file://' + filepath, clonedRequest);
  }
}

export function registerProtocol() {
  // it seems that there is some issue to postMessage between renderer with custom protocol & helper process
  protocol.handle('http', request => {
    return handleHttpRequest(request);
  });

  protocol.handle('https', request => {
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
