import { EventEmitter } from 'node:events';

import ava from 'ava';
import EventEmitter2 from 'eventemitter2';
import { CLS_ID, ClsService } from 'nestjs-cls';
import Sinon from 'sinon';

import {
  decodeEventPayload,
  encodeEventPayload,
  EventBus,
  EVENTBUS_REDIS_CHANNEL,
  resolveDeploymentChannel,
} from '../../base/event/eventbus';
import { SpaceSyncGateway, SpaceType } from '../../core/sync/gateway';

function createEventBusWithMocks(subscribe = async () => 1) {
  const emitter = new EventEmitter2({ maxListeners: 100 });
  const store = new Map<PropertyKey, unknown>();
  const cls = {
    run: (fn: () => any) => fn(),
    getId: () => store.get(CLS_ID) as string | undefined,
    set: (key: PropertyKey, val: unknown) => store.set(key, val),
    get: (key: PropertyKey) => store.get(key),
  } as unknown as ClsService;
  const scanner = { scan: () => [] } as any;

  const published: Array<{ channel: string; message: string }> = [];
  const redisClients: Array<EventEmitter & { subscribe: Sinon.SinonSpy }> = [];
  const redisClient = {
    duplicate: () => {
      const client = Object.assign(new EventEmitter(), {
        subscribe: Sinon.spy(subscribe),
        publish: async (channel: string, message: string) => {
          published.push({ channel, message });
          return 1;
        },
        quit: async () => 'OK',
        disconnect: () => {},
      });
      redisClients.push(client);
      return client;
    },
  } as any;

  const s2sListeners: Record<string, (...args: any[]) => void> = {};
  const s2sEmitted: any[][] = [];
  const fakeServer = {
    on: (event: string, cb: (...args: any[]) => void) => {
      s2sListeners[event] = cb;
    },
    serverSideEmit: (...args: any[]) => {
      s2sEmitted.push(args);
    },
  };

  const bus = new EventBus(emitter, cls, scanner, redisClient);
  (bus as any).server = fakeServer;

  return {
    bus,
    published,
    redisClients,
    s2sListeners,
    s2sEmitted,
    deliverRedis: (message: string) =>
      redisClients[1]?.emit('message', EVENTBUS_REDIS_CHANNEL, message),
  };
}

ava(
  'encodeEventPayload / decodeEventPayload roundtrips binary Uint8Array and Buffer deterministically',
  t => {
    const raw = {
      spaceId: 'ws-1',
      buf: Buffer.from([1, 2, 3, 255]),
      nested: [
        new Uint8Array([9, 8, 7]),
        { literal: { $b64: 'not-only', extra: 1 } },
      ],
    };
    const encoded = encodeEventPayload(raw) as any;
    t.deepEqual(encoded.buf, {
      $b64: Buffer.from([1, 2, 3, 255]).toString('base64'),
    });
    t.deepEqual(encoded.nested[0], {
      $b64: Buffer.from([9, 8, 7]).toString('base64'),
    });

    const decoded = decodeEventPayload(
      JSON.parse(JSON.stringify(encoded))
    ) as any;
    t.true(Buffer.isBuffer(decoded.buf));
    t.deepEqual([...decoded.buf], [1, 2, 3, 255]);
    t.true(Buffer.isBuffer(decoded.nested[0]));
    t.deepEqual([...decoded.nested[0]], [9, 8, 7]);
    t.deepEqual(decoded.nested[1], { literal: { $b64: 'not-only', extra: 1 } });
  }
);

ava(
  'EventBus drops self-loopback and deduplicates dual-channel s2s + Redis delivery',
  async t => {
    const { bus, published, s2sListeners, s2sEmitted, deliverRedis } =
      createEventBusWithMocks();
    await bus.onModuleInit();
    await bus.onApplicationBootstrap();

    const received: any[] = [];
    bus.on('config.changed.broadcast', payload => {
      received.push(payload);
    });

    // Broadcast sends to both s2s (with meta {id, originChannel}) and Redis
    bus.broadcast('config.changed.broadcast', { keys: ['initial'] });
    t.is(s2sEmitted.length, 1);
    t.is(published.length, 1);
    t.is(published[0].channel, EVENTBUS_REDIS_CHANNEL);

    const envelope = JSON.parse(published[0].message);
    t.is(envelope.v, 1);
    t.is(envelope.originId, bus.instanceId);
    t.is(s2sEmitted[0][4].id, envelope.id);

    // Self-loopback over Redis is dropped
    t.false(bus.handleRedisMessage(published[0].message));
    t.is(received.length, 0);

    // Remote message arriving on BOTH Redis and /s2s with the same id triggers listener once
    const remoteId = 'eb_remote_dedupe_1';
    const remoteEnvelope = JSON.stringify({
      v: 1,
      id: remoteId,
      originId: 'other-instance-id',
      originChannel: 'beta',
      requestId: 'req-remote-1',
      event: 'config.changed.broadcast',
      payload: { keys: ['remote'] },
    });
    const receivedEvent = bus.waitFor('config.changed.broadcast');
    deliverRedis(remoteEnvelope);
    s2sListeners['broadcast'](
      'config.changed.broadcast',
      { keys: ['remote'] },
      'req-remote-1',
      {
        id: remoteId,
        originChannel: 'beta',
      }
    );
    await receivedEvent;
    t.is(received.length, 1);
    t.deepEqual(received[0], { keys: ['remote'] });

    await bus.onModuleDestroy();
  }
);

ava(
  'EventBus startup is independent of an offline subscription and retries on ready',
  async t => {
    const { bus, redisClients } = createEventBusWithMocks(
      () => new Promise<number>(() => {})
    );
    const warn = Sinon.spy((bus as any).logger, 'warn');
    await bus.onApplicationBootstrap();
    t.is(redisClients[1].subscribe.callCount, 1);
    redisClients[1].emit('ready');
    t.is(redisClients[1].subscribe.callCount, 2);
    for (const client of redisClients)
      client.emit('error', new Error('offline'));
    t.is(warn.callCount, 2);
    t.false(
      bus.handleRedisMessage(
        JSON.stringify({
          v: 1,
          id: 'unknown',
          originId: 'remote',
          event: 'config.init',
          payload: {},
        })
      )
    );
    await bus.onModuleDestroy();
  }
);

ava.serial(
  'AFFINE_ENV alone distinguishes beta and production delivery and invalidates batchRoom',
  async t => {
    const previousChannel = process.env.AFFINE_DEPLOYMENT_CHANNEL;
    const previousEnv = process.env.AFFINE_ENV;
    delete process.env.AFFINE_DEPLOYMENT_CHANNEL;
    const sender = createEventBusWithMocks();
    const receiver = createEventBusWithMocks();
    try {
      await sender.bus.onApplicationBootstrap();
      await receiver.bus.onApplicationBootstrap();
      const emit = Sinon.spy();
      const to = Sinon.stub().returns({ emit });
      const gateway = Object.create(SpaceSyncGateway.prototype);
      gateway.server = { local: { to } };
      gateway.event = receiver.bus;
      gateway.emitActiveDocUpdate = Sinon.spy();
      receiver.bus.on('sync.doc.updates.pushed', payload =>
        gateway.onClusterDocUpdatesPushed(payload)
      );
      process.env.AFFINE_ENV = 'beta';
      t.is(resolveDeploymentChannel(), 'beta');
      sender.bus.broadcast('sync.doc.updates.pushed', {
        spaceType: SpaceType.Workspace,
        spaceId: 'ws-env',
        docId: 'doc',
        updates: [],
        timestamp: 123,
        compressed: false,
      });
      t.is(JSON.parse(sender.published[0].message).originChannel, 'beta');
      process.env.AFFINE_ENV = 'production';
      t.is(resolveDeploymentChannel(), 'production');
      const delivered = receiver.bus.waitFor('sync.doc.updates.pushed');
      receiver.deliverRedis(sender.published[0].message);
      await delivered;
      t.true(to.calledOnceWith('workspace:ws-env:sync-027'));
      t.true(
        emit.calledOnceWith('space:broadcast-doc-invalidation', {
          spaceType: 'workspace',
          spaceId: 'ws-env',
          timestamp: 123,
        })
      );
      t.true(gateway.emitActiveDocUpdate.calledOnce);
    } finally {
      if (previousChannel === undefined)
        delete process.env.AFFINE_DEPLOYMENT_CHANNEL;
      else process.env.AFFINE_DEPLOYMENT_CHANNEL = previousChannel;
      if (previousEnv === undefined) delete process.env.AFFINE_ENV;
      else process.env.AFFINE_ENV = previousEnv;
      await sender.bus.onModuleDestroy();
      await receiver.bus.onModuleDestroy();
    }
  }
);

ava(
  'cross-channel sync.doc.updates.pushed emits batchRoom sidebar invalidation',
  async t => {
    const localEmit = Sinon.spy();
    const localTo = Sinon.stub().returns({ emit: localEmit });
    const emitActiveDocUpdate = Sinon.spy();

    const fakeGateway = Object.create(SpaceSyncGateway.prototype);
    fakeGateway.server = { local: { to: localTo } };
    fakeGateway.event = {
      localChannel: 'stable',
      getCurrentOriginChannel: () => 'beta',
    };
    fakeGateway.emitActiveDocUpdate = emitActiveDocUpdate;

    fakeGateway.onClusterDocUpdatesPushed({
      spaceType: 'workspace',
      spaceId: 'ws-cross',
      docId: 'doc-1',
      updates: [Buffer.from([1, 2]).toString('base64')],
      timestamp: 123456,
      compressed: false,
      originChannel: 'beta',
    });

    const expectedRoom = 'workspace:ws-cross:sync-027';
    t.true(localTo.calledOnceWith(expectedRoom));
    t.true(
      localEmit.calledOnceWith('space:broadcast-doc-invalidation', {
        spaceType: 'workspace',
        spaceId: 'ws-cross',
        timestamp: 123456,
      })
    );
    t.true(emitActiveDocUpdate.calledOnce);

    // Same-channel update does NOT double-emit batchRoom invalidation
    localTo.resetHistory();
    localEmit.resetHistory();
    fakeGateway.onClusterDocUpdatesPushed({
      spaceType: 'workspace',
      spaceId: 'ws-cross',
      docId: 'doc-1',
      updates: [Buffer.from([1, 2]).toString('base64')],
      timestamp: 123457,
      compressed: false,
      originChannel: 'stable',
    });
    t.true(localTo.notCalled);
  }
);
