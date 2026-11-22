import { createServer } from 'node:http';

import { workspaceRequire } from './socketio-driver.mjs';
const require = workspaceRequire();
const { Server } = require('socket.io');
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/login')
    res.setHeader(
      'set-cookie',
      'sid=reference-session; Path=/; HttpOnly; SameSite=Lax'
    );
  res.end(JSON.stringify({ ok: true }));
});
const io = new Server(server, {
  pingInterval: 15,
  pingTimeout: 300,
  transports: ['polling', 'websocket'],
});
io.use((socket, next) => {
  if (socket.handshake.auth.reject) {
    const error = new Error(
      process.env.PARITY_REFERENCE_AUTH_MESSAGE ?? 'AuthenticationRequired'
    );
    error.data = { code: 'AUTHENTICATION_REQUIRED', status: 401 };
    next(error);
  } else next();
});
io.on('connection', socket => {
  socket.emit('ready', {
    cookie: socket.handshake.headers.cookie ?? null,
    header: socket.handshake.headers['x-parity'] ?? null,
  });
  socket.on('echo', (payload, ack) => {
    socket.emit('binary-push', { bytes: Buffer.from([0, 1, 2, 255]), payload });
    ack({
      payload,
      bytes: Buffer.from([3, 4, 255]),
      cookie: socket.handshake.headers.cookie ?? null,
    });
  });
  socket.on('delayed', (payload, ack) =>
    setTimeout(() => ack({ payload, alive: socket.connected }), 80)
  );
});
server.listen(0, '127.0.0.1', () =>
  process.stdout.write(
    JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }) + '\n'
  )
);
