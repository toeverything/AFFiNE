// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { check, fail } from 'k6';
import ws from 'k6/ws';

import { makeConnection } from './socketio';

const domain = '[::1]:3010';

function randomString(length: number, charset = 'abcdefghijklmnopqrstuvwxyz') {
  let res = '';
  const start = Math.random();
  while (length--) res += charset[(start * 255 + length) % charset.length | 0];
  return res;
}

function generateWorkspaceUpdate(workspaceId: string, guid = uuidv4()) {
  const msg = [
    'client-update',
    { workspaceId, guid, update: randomString(100) },
  ];
  return `42${JSON.stringify(msg)}`;
}

export function startSync(workspaceId: string) {
  const sid = makeConnection(domain);
  const url = `ws://${domain}/socket.io/?EIO=4&transport=websocket&sid=${sid}`;

  const response = ws.connect(url, null, socket => {
    let closed = false;

    socket.on('open', function open() {
      socket.send('2probe');
    });

    socket.on('message', msg => {
      switch (msg) {
        case '3probe':
          socket.setInterval(function timeout() {
            if (!closed) {
              socket.ping();
              socket.send(generateWorkspaceUpdate(workspaceId));
            }
          }, 10);
          break;
        case '2':
          socket.send('3');
          break;
        default:
          console.log(msg);
      }
    });

    socket.on('error', e => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (e.error() != 'websocket: close sent' && e.code != 1005) {
        fail('An unexpected error occurred: ' + e.error());
      }
    });

    socket.setTimeout(function () {
      closed = true;
      socket.setTimeout(function () {
        socket.close();
      }, 1000);
    }, 2000);
  });

  check(response, { 'status is 101': r => r && r.status === 101 });
}
