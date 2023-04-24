import { protocol, session } from 'electron';
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
    },
  },
]);

function toAbsolutePath(url: string) {
  let realpath = decodeURIComponent(url);
  const webStaticDir = join(__dirname, '../../../resources/web-static');
  if (url.startsWith('./')) {
    // if is a file type, load the file in resources
    if (url.split('/').at(-1)?.includes('.')) {
      realpath = join(webStaticDir, decodeURIComponent(url));
    } else {
      // else, fallback to load the index.html instead
      realpath = join(webStaticDir, 'index.html');
    }
  }
  return realpath;
}

export function registerProtocol() {
  protocol.interceptFileProtocol('file', (request, callback) => {
    const url = request.url.replace(/^file:\/\//, '');
    const realpath = toAbsolutePath(url);
    // console.log('realpath', realpath, 'for', url);
    callback(realpath);
    return true;
  });

  protocol.registerFileProtocol('assets', (request, callback) => {
    const url = request.url.replace(/^assets:\/\//, '');
    const realpath = toAbsolutePath(url);
    // console.log('realpath', realpath, 'for', url);
    callback(realpath);
    return true;
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
