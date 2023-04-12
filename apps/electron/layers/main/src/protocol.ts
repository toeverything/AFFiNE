import { protocol, session } from 'electron';
import { join } from 'path';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

export function registerProtocol() {
  if (process.env.NODE_ENV === 'production') {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.replace(/^app:\/\//, '');
      const webStaticDir = join(__dirname, '../../../resources/web-static');
      if (url.startsWith('./')) {
        // if is a file type, load the file in resources
        if (url.split('/').at(-1)?.includes('.')) {
          const realpath = join(webStaticDir, decodeURIComponent(url));
          callback(realpath);
        } else {
          // else, fallback to load the index.html instead
          const realpath = join(webStaticDir, 'index.html');
          console.log(realpath, 'realpath', url, 'url');
          callback(realpath);
        }
      }
    });
  }

  session.defaultSession.webRequest.onHeadersReceived(
    (responseDetails, callback) => {
      const { responseHeaders, url } = responseDetails;
      if (responseHeaders) {
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      }

      callback({ responseHeaders });
    }
  );
}
