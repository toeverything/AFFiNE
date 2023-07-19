import { check, fail } from 'k6';
import ws from 'k6/ws';

import { makeConnection } from './socketio';

export const options = {
  vus: 1000,
  duration: '30s',
  ext: {
    loadimpact: {
      projectID: 3633177,
      name: 'websocket test',
    },
  },
};

const domain = '[::1]:3010';
const workspaceId = '6688e9d2-8fc6-475e-885d-25d4d20fff75';
const guid = '4c964294-3fc3-4132-9404-0caf285b70eb';

function randomString(length: number, charset = 'abcdefghijklmnopqrstuvwxyz') {
  let res = '';
  const start = Math.random();
  while (length--) res += charset[(start * 255 + length) % charset.length | 0];
  return res;
}

function generateWorkspaceUpdate() {
  const msg = [
    'client-update',
    { workspaceId, guid, update: randomString(100) },
  ];
  return `42${JSON.stringify(msg)}`;
}

export default function () {
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
              socket.send(generateWorkspaceUpdate());
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
