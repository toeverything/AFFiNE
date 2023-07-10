import { net, protocol, session } from 'electron';
import { join } from 'path';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'assets',
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

const NETWORK_REQUESTS = ['/api', '/socket.io', '/graphql'];

// function toAbsolutePath(url: string): Electron.ProtocolResponse | string {
//   let realpath = decodeURIComponent(url);
//   const webStaticDir = join(__dirname, '../resources/web-static');
//   // ALL URLs should start with ./
//   if (url.startsWith('./')) {
//     if (url.split('/').at(-1)?.includes('.')) {
//       realpath = join(webStaticDir, decodeURIComponent(url));
//     } else {
//       // else, fallback to load the index.html instead
//       realpath = join(webStaticDir, 'index.html');
//     }
//     return {
//       path: realpath,
//     };
//   }
//   return realpath;
// }

export function registerProtocol() {
  // protocol.interceptFileProtocol('file', (request, callback) => {
  //   const url = request.url.replace(/^file:\/\//, '');
  //   const realpath = toAbsolutePath(url);
  //   callback(realpath);
  //   return true;
  // });

  protocol.handle('assets', request => {
    const url = request.url.replace(/^assets:\/\//, '');
    let realpath = decodeURIComponent(url);

    const webStaticDir = join(__dirname, '../resources/web-static');
    // ALL URLs should start with ./
    if (url.startsWith('./')) {
      if (NETWORK_REQUESTS.some(path => url.startsWith('.' + path))) {
        const realUrl = process.env.CLOUD_URL + url.substring(1);
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
    return net.fetch('file://' + realpath);
  });

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
