import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server, type Socket } from 'socket.io';

import type { AuthService } from '../../application/auth-service.js';
import type { BlobService } from '../../application/blob-service.js';
import type { CommentService } from '../../application/comment-service.js';
import type { DocService } from '../../application/doc-service.js';
import type { MembershipService } from '../../application/membership-service.js';
import type { ShareService } from '../../application/share-service.js';
import type { AppConfig } from '../../config/env.js';
import type { DocLifecycle } from '../../domain/doc.js';
import { AppError, errors } from '../../domain/errors.js';
import type { User } from '../../domain/identity.js';
import type { HttpMetrics } from '../observability/metrics.js';
import { COOKIE_SESSION, parseCookieHeader } from '../http/cookies.js';
import {
  docRoom,
  JOIN_BATCH_LIMIT,
  realtimeInputKey,
  realtimeRoom,
  spaceRoom,
} from './rooms.js';
import {
  handleRealtimeRequest,
  REALTIME_TOPICS,
  workspaceIdOfTopic,
} from './requests.js';

declare module 'socket.io' {
  interface SocketData {
    user: User;
    rooms: Set<string>;
    realtimeSubscriptions: Map<string, string>;
  }
}

interface HandshakeAuth {
  token?: string;
  tokenType?: string;
}

interface JoinBatchPayload {
  spaces?: Array<{ spaceType?: string; spaceId?: string; docId?: string }>;
  clientVersion?: string;
}

interface SpaceDocPayload {
  spaceType?: string;
  spaceId?: string;
  docId?: string;
  stateVector?: string;
  update?: string;
  timestamp?: number;
  lifecycle?: 'trash' | 'restore' | 'delete';
  awarenessUpdate?: string;
  docIds?: string[];
}

type Ack<T> = (
  response: { error: { name: string; message: string } } | { data: T }
) => void;

function bearerFromHeader(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1];
}

function headerString(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function ackError(error: unknown): {
  error: { name: string; message: string };
} {
  if (error instanceof AppError) {
    return { error: { name: error.name, message: error.message } };
  }
  return {
    error: { name: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' },
  };
}

function ackData<T>(data: T): { data: T } {
  return { data };
}

function toHandshakeError(error: AppError): Error {
  const handshake = new Error(error.message) as Error & {
    data: { name: string; message: string };
  };
  handshake.data = { name: error.name, message: error.message };
  return handshake;
}

function decodeUpdate(value: string | undefined): Uint8Array {
  if (!value) {
    throw errors.badRequest('Missing binary payload.');
  }
  try {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  } catch {
    throw errors.badRequest('Invalid base64 payload.');
  }
}

function encodeUpdate(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function requireFields(payload: SpaceDocPayload): {
  spaceType: string;
  spaceId: string;
  docId: string;
} {
  if (!payload.spaceType || !payload.spaceId || !payload.docId) {
    throw errors.badRequest('spaceType, spaceId, and docId are required.');
  }
  return {
    spaceType: payload.spaceType,
    spaceId: payload.spaceId,
    docId: payload.docId,
  };
}

export const socketPlugin = fp<{
  auth: AuthService;
  docs: DocService;
  members: MembershipService;
  shares: ShareService;
  comments: CommentService;
  blobs: BlobService;
  config: AppConfig;
  metrics: HttpMetrics;
}>(
  async (app, opts) => {
    const io = new Server(app.server, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      cors: {
        origin:
          opts.config.NODE_ENV === 'production'
            ? opts.config.MOSAIC_PUBLIC_URL
            : true,
        credentials: true,
      },
      pingTimeout: 25_000,
      pingInterval: 20_000,
    });

    io.use(async (socket, next) => {
      try {
        const handshake = socket.handshake;
        const auth = handshake.auth as HandshakeAuth;
        const cookies = parseCookieHeader(
          headerString(handshake.headers.cookie)
        );
        const authorization = headerString(handshake.headers.authorization);
        const session = await opts.auth.authenticateHandshake({
          bearerToken: auth.token ?? bearerFromHeader(authorization),
          cookieToken: cookies[COOKIE_SESSION],
        });
        const user = await opts.auth.getUser(session);
        if (!session || !user) {
          next(toHandshakeError(errors.authenticationRequired()));
          return;
        }
        socket.data.user = user;
        socket.data.rooms = new Set<string>();
        socket.data.realtimeSubscriptions = new Map<string, string>();
        next();
      } catch (error) {
        next(
          error instanceof AppError
            ? toHandshakeError(error)
            : error instanceof Error
              ? error
              : toHandshakeError(errors.authenticationRequired())
        );
      }
    });

    io.on('connection', socket => {
      bindSocket(app, socket, opts);
    });

    app.decorate('mosaicIo', io);
    // Disconnect sockets without io.close(): that would close Fastify's HTTP
    // server and can deadlock with Fastify shutdown (keep-alive Engine.IO polls).
    app.addHook('preClose', done => {
      io.disconnectSockets(true);
      done();
    });
  },
  { name: 'mosaic-socket' }
);

function bindSocket(
  app: FastifyInstance,
  socket: Socket,
  opts: {
    auth: AuthService;
    docs: DocService;
    members: MembershipService;
    shares: ShareService;
    comments: CommentService;
    blobs: BlobService;
    config: AppConfig;
    metrics: HttpMetrics;
  }
): void {
  const user = (): User => socket.data.user as User;

  const handle = async <T>(ack: Ack<T> | undefined, run: () => Promise<T>) => {
    try {
      const data = await run();
      ack?.(ackData(data));
    } catch (error) {
      if (!(error instanceof AppError)) {
        app.log.error({ err: error }, 'socket_handler_error');
      }
      ack?.(ackError(error));
    }
  };

  socket.on(
    'space:join-batch',
    (
      payload: JoinBatchPayload,
      ack?: Ack<{ clientId: string; success: boolean }>
    ) => {
      void handle(ack, async () => {
        const spaces = payload.spaces ?? [];
        if (spaces.length > JOIN_BATCH_LIMIT) {
          throw errors.joinBatchTooLarge(JOIN_BATCH_LIMIT);
        }
        for (const space of spaces) {
          if (!space.spaceType || !space.spaceId) {
            throw errors.badRequest('spaceType and spaceId are required.');
          }
          await opts.docs.authorize(user(), space.spaceType, space.spaceId);
          const room = spaceRoom(space.spaceType, space.spaceId);
          await socket.join(room);
          socket.data.rooms.add(room);
          if (space.docId) {
            const droom = docRoom(space.spaceType, space.spaceId, space.docId);
            await socket.join(droom);
            socket.data.rooms.add(droom);
          }
        }
        return { clientId: socket.id, success: true };
      });
    }
  );

  socket.on('space:leave-batch', (payload: SpaceDocPayload) => {
    const spaceType = payload.spaceType;
    const spaceId = payload.spaceId;
    if (!spaceType || !spaceId) {
      return;
    }
    const docIds = payload.docIds ?? [];
    if (docIds.length === 0) {
      const prefix = `${spaceRoom(spaceType, spaceId)}`;
      for (const room of socket.data.rooms as Set<string>) {
        if (room === prefix || room.startsWith(`${prefix}:`)) {
          void socket.leave(room);
          socket.data.rooms.delete(room);
        }
      }
      return;
    }
    for (const docId of docIds) {
      const room = docRoom(spaceType, spaceId, docId);
      void socket.leave(room);
      socket.data.rooms.delete(room);
    }
  });

  socket.on(
    'space:load-doc',
    (
      payload: SpaceDocPayload,
      ack?: Ack<{ missing: string; state: string; timestamp: number }>
    ) => {
      void handle(ack, async () => {
        const fields = requireFields(payload);
        const loaded = await opts.docs.load(
          user(),
          payload.stateVector
            ? { ...fields, stateVector: decodeUpdate(payload.stateVector) }
            : fields
        );
        return {
          missing: encodeUpdate(loaded.missing),
          state: encodeUpdate(loaded.state),
          timestamp: loaded.timestamp,
        };
      });
    }
  );

  socket.on(
    'space:push-doc-update',
    (payload: SpaceDocPayload, ack?: Ack<{ timestamp: number }>) => {
      void handle(ack, async () => {
        const fields = requireFields(payload);
        const started = Date.now();
        const update = decodeUpdate(payload.update);
        opts.metrics.updateSizeBytes.observe(update.byteLength);
        const result = await opts.docs.push(user(), { ...fields, update });
        const room = docRoom(fields.spaceType, fields.spaceId, fields.docId);
        await socket.join(room);
        socket.data.rooms.add(room);
        if (!result.duplicate) {
          socket.to(room).emit('space:broadcast-doc-updates', {
            spaceType: fields.spaceType,
            spaceId: fields.spaceId,
            docId: fields.docId,
            updates: [payload.update],
            timestamp: result.timestamp,
            editor: user().id,
            compressed: false,
          });
        }
        opts.metrics.syncLagMs.set(Date.now() - started);
        return { timestamp: result.timestamp };
      });
    }
  );

  socket.on(
    'space:load-doc-timestamps',
    (payload: SpaceDocPayload, ack?: Ack<Record<string, number>>) => {
      void handle(ack, async () => {
        if (!payload.spaceType || !payload.spaceId) {
          throw errors.badRequest('spaceType and spaceId are required.');
        }
        return opts.docs.timestamps(
          user(),
          payload.spaceType,
          payload.spaceId,
          payload.timestamp
        );
      });
    }
  );

  socket.on(
    'space:delete-doc',
    (payload: SpaceDocPayload, ack?: Ack<{ success?: true }>) => {
      void handle(ack, async () => {
        const fields = requireFields(payload);
        await opts.docs.delete(
          user(),
          fields.spaceType,
          fields.spaceId,
          fields.docId
        );
        socket
          .to(spaceRoom(fields.spaceType, fields.spaceId))
          .emit('space:broadcast-doc-invalidation', {
            spaceType: fields.spaceType,
            spaceId: fields.spaceId,
            timestamp: Date.now(),
          });
        return { success: true as const };
      });
    }
  );

  socket.on(
    'space:doc-lifecycle',
    (
      payload: SpaceDocPayload,
      ack?: Ack<{ rootUpdate: string; timestamp: number }>
    ) => {
      void handle(ack, async () => {
        const fields = requireFields(payload);
        if (
          payload.lifecycle !== 'trash' &&
          payload.lifecycle !== 'restore' &&
          payload.lifecycle !== 'delete'
        ) {
          throw errors.badRequest(
            'lifecycle must be trash, restore, or delete.'
          );
        }
        const result = await opts.docs.applyLifecycle(user(), {
          ...fields,
          lifecycle: payload.lifecycle as
            | DocLifecycle
            | 'restore'
            | 'delete'
            | 'trash',
        });
        socket
          .to(spaceRoom(fields.spaceType, fields.spaceId))
          .emit('space:broadcast-doc-invalidation', {
            spaceType: fields.spaceType,
            spaceId: fields.spaceId,
            timestamp: result.timestamp,
          });
        return {
          rootUpdate: encodeUpdate(result.rootUpdate),
          timestamp: result.timestamp,
        };
      });
    }
  );

  socket.on('space:update-awareness', (payload: SpaceDocPayload) => {
    void (async () => {
      if (
        !payload.spaceType ||
        !payload.spaceId ||
        !payload.docId ||
        !payload.awarenessUpdate
      ) {
        return;
      }
      await opts.docs.authorize(user(), payload.spaceType, payload.spaceId);
      const room = docRoom(payload.spaceType, payload.spaceId, payload.docId);
      socket.to(room).emit('space:broadcast-awareness-update', {
        spaceType: payload.spaceType,
        spaceId: payload.spaceId,
        docId: payload.docId,
        awarenessUpdate: payload.awarenessUpdate,
      });
    })().catch(() => undefined);
  });

  socket.on('space:load-awarenesses', (payload: SpaceDocPayload) => {
    void (async () => {
      if (!payload.spaceType || !payload.spaceId || !payload.docId) {
        return;
      }
      await opts.docs.authorize(user(), payload.spaceType, payload.spaceId);
      const room = docRoom(payload.spaceType, payload.spaceId, payload.docId);
      socket.to(room).emit('space:collect-awareness', {
        spaceType: payload.spaceType,
        spaceId: payload.spaceId,
        docId: payload.docId,
      });
    })().catch(() => undefined);
  });

  socket.on(
    'telemetry:batch',
    (
      payload: { events?: unknown[] },
      ack?: Ack<{ ok: true; accepted: number; dropped: number }>
    ) => {
      app.log.info({ op: 'telemetry:batch' }, 'compat.stub');
      const accepted = Array.isArray(payload?.events)
        ? payload.events.length
        : 0;
      ack?.(ackData({ ok: true, accepted, dropped: 0 }));
    }
  );

  socket.on(
    'realtime:request',
    (payload: { op?: string; input?: unknown }, ack?: Ack<unknown>) => {
      void handle(ack, async () => {
        if (!payload?.op) {
          throw errors.badRequest('op is required.');
        }
        const input =
          payload.input &&
          typeof payload.input === 'object' &&
          !Array.isArray(payload.input)
            ? (payload.input as Record<string, unknown>)
            : {};
        return handleRealtimeRequest(user(), payload.op, input, {
          auth: opts.auth,
          members: opts.members,
          shares: opts.shares,
          comments: opts.comments,
          blobs: opts.blobs,
        });
      });
    }
  );

  socket.on(
    'realtime:subscribe',
    (
      payload: { topic?: string; input?: unknown },
      ack?: Ack<{ subscriptionId: string }>
    ) => {
      void handle(ack, async () => {
        const topic = payload?.topic;
        if (!topic || !REALTIME_TOPICS.has(topic)) {
          throw errors.actionForbidden(
            'Realtime is not enabled on this Mosaic server.'
          );
        }
        const input =
          payload.input &&
          typeof payload.input === 'object' &&
          !Array.isArray(payload.input)
            ? (payload.input as Record<string, unknown>)
            : {};
        const workspaceId = workspaceIdOfTopic(topic, input);
        if (workspaceId) {
          await opts.members.accessSnapshot(user(), workspaceId);
        }
        const subscriptionId = crypto.randomUUID();
        const room = realtimeRoom(topic, realtimeInputKey(input));
        await socket.join(room);
        socket.data.rooms.add(room);
        socket.data.realtimeSubscriptions.set(subscriptionId, room);
        return { subscriptionId };
      });
    }
  );

  socket.on(
    'realtime:unsubscribe',
    (
      payload: { subscriptionId?: string } | undefined,
      ack?: Ack<{ ok: true }>
    ) => {
      const subscriptionId = payload?.subscriptionId;
      const room = subscriptionId
        ? socket.data.realtimeSubscriptions.get(subscriptionId)
        : undefined;
      if (subscriptionId && room) {
        void socket.leave(room);
        socket.data.rooms.delete(room);
        socket.data.realtimeSubscriptions.delete(subscriptionId);
      }
      ack?.(ackData({ ok: true as const }));
    }
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    mosaicIo?: Server;
  }
}
