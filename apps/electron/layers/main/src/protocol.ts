import { protocol } from 'electron';
import { join } from 'path';

export function registerProtocol() {
  protocol.interceptFileProtocol('file', (request, callback) => {
    const url = request.url.replace(/^file:\/\//, '');
    const realpath = join(
      __dirname,
      '../../../resources/web-static',
      decodeURIComponent(url)
    );
    callback(realpath);
  });
}
