import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export function workspaceRequire() {
  let root = process.env.AFFINE_NODE_MODULES_ROOT;
  if (!root) {
    root = dirname(fileURLToPath(import.meta.url));
    while (!existsSync(join(root, 'yarn.lock'))) {
      const parent = resolve(root, '..');
      if (parent === root) throw new Error('AFFiNE yarn.lock root not found');
      root = parent;
    }
  }
  return createRequire(join(root, 'package.json'));
}
const require = workspaceRequire();
if (require('socket.io-client/package.json').version !== '4.8.3')
  throw new Error('socket.io-client@4.8.3 is required by the wire oracle');
const { io } = require('socket.io-client');
const { PacketType } = require('socket.io-parser');
function encode(value) {
  if (
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  )
    return {
      $b64: Buffer.from(
        value instanceof ArrayBuffer ? new Uint8Array(value) : value
      ).toString('base64'),
    };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encode(v)])
    );
  return value;
}
function decode(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof value.$b64 === 'string'
  )
    return Buffer.from(value.$b64, 'base64');
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decode(v)])
    );
  return value;
}
async function run(input) {
  const timeout = input.timeout_ms;
  const socket = io(input.url + (input.namespace ?? ''), {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    timeout,
    path: input.path ?? '/socket.io/',
    transports: input.transports ?? ['polling', 'websocket'],
    upgrade: true,
    withCredentials: true,
    extraHeaders: input.headers ?? {},
    auth: decode(input.auth ?? {}),
  });
  const events = [];
  const waiters = new Set();
  const acks = [];
  let initialTransport;
  let protocolRejection = false;
  socket.io.on('packet', packet => {
    if (packet.nsp === socket.nsp && packet.type === PacketType.CONNECT_ERROR)
      protocolRejection = true;
  });
  socket.io.on('open', () => {
    initialTransport = socket.io.engine.transport.name;
  });
  socket.onAny((event, ...args) => {
    events.push({ event, args: encode(args) });
    for (const wake of waiters) wake();
  });
  async function until(predicate, label) {
    if (predicate()) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`timeout: ${label}`));
      }, timeout);
      const check = () => {
        if (predicate()) {
          clearTimeout(timer);
          waiters.delete(check);
          resolve();
        }
      };
      waiters.add(check);
      check();
    });
  }
  try {
    const connection = await new Promise((resolve, reject) => {
      socket.once('connect', () => resolve({ connected: true }));
      socket.once('connect_error', error => {
        // The SDK destroys the namespace before emitting connect_error. Classify
        // using its already-decoded CONNECT_ERROR packet, never connection state.
        if (protocolRejection) {
          resolve({
            connected: false,
            connect_error: {
              message: error.message,
              data: encode(error.data ?? null),
            },
          });
        } else reject(error);
      });
      socket.connect();
    });
    if (!connection.connected) return connection;
    for (const action of input.actions) {
      if (action.action === 'emit_with_ack') {
        const ack = await socket
          .timeout(timeout)
          .emitWithAck(action.event, ...decode(action.args ?? []));
        acks.push({ event: action.event, value: encode(ack) });
      } else if (action.action === 'emit')
        socket.emit(action.event, ...decode(action.args ?? []));
      else if (action.action === 'wait_event')
        await until(
          () =>
            events.filter(e => e.event === action.event).length >= action.count,
          `event ${action.event}`
        );
      else if (action.action === 'wait_upgrade') {
        const engine = socket.io.engine;
        engine.on('upgrade', () => {
          for (const wake of waiters) wake();
        });
        await until(
          () => engine.transport.name === 'websocket',
          'polling to websocket upgrade'
        );
      } else throw new Error(`unknown Socket.IO action ${action.action}`);
      if (!socket.connected)
        throw new Error('Socket.IO disconnected while running actions');
    }
    const recorded = input.record_events;
    return {
      connected: true,
      initial_transport: initialTransport,
      transport: socket.io.engine.transport.name,
      acks,
      events: recorded
        ? events.filter(e => recorded.includes(e.event))
        : events,
    };
  } finally {
    socket.disconnect();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for await (const line of createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })) {
    if (!line.trim()) continue;
    try {
      process.stdout.write(
        JSON.stringify({ result: await run(JSON.parse(line)) }) + '\n'
      );
    } catch (error) {
      process.stdout.write(
        JSON.stringify({ error: String(error?.stack ?? error) }) + '\n'
      );
      process.exitCode = 1;
    }
  }
}
