import type {
  RealtimeAck,
  RealtimeRequestInputOf,
  RealtimeRequestName,
  RealtimeRequestOutputOf,
} from '@affine/realtime';
import { io, type Socket as SocketIOClient } from 'socket.io-client';
import type { Response } from 'supertest';

import type { MockedUser } from '../mocks';
import type { TestingApp } from './create-app';

const REALTIME_CLIENT_VERSION = '0.26.0';
const WS_TIMEOUT_MS = 5_000;

function cookieHeader(res: Response) {
  return (res.get('Set-Cookie') ?? [])
    .map(cookie => cookie.split(';')[0])
    .join('; ');
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms): ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForConnect(socket: SocketIOClient) {
  if (socket.connected) {
    return;
  }

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    }),
    WS_TIMEOUT_MS,
    'realtime socket connect'
  );
}

export async function createRealtimeClient(app: TestingApp, user: MockedUser) {
  const login = await app.login(user);
  const socket = io(app.url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: {
      cookie: cookieHeader(login),
    },
  });
  await waitForConnect(socket);
  return socket;
}

export async function realtimeRequest<Op extends RealtimeRequestName>(
  socket: SocketIOClient,
  op: Op,
  input: RealtimeRequestInputOf<Op>
): Promise<RealtimeRequestOutputOf<Op>> {
  const ack = await withTimeout(
    new Promise<RealtimeAck<RealtimeRequestOutputOf<Op>>>(resolve => {
      socket.emit(
        'realtime:request',
        { op, input, clientVersion: REALTIME_CLIENT_VERSION },
        (res: RealtimeAck<RealtimeRequestOutputOf<Op>>) => resolve(res)
      );
    }),
    WS_TIMEOUT_MS,
    `realtime request ${op}`
  );

  if ('error' in ack) {
    throw new Error(`${ack.error.name}: ${ack.error.message}`);
  }

  return ack.data;
}
