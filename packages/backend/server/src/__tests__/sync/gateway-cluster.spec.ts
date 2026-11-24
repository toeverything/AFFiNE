import test from 'ava';
import { Doc as YDoc } from 'yjs';

import { SpaceSyncGateway } from '../../core/sync/gateway';

test('onClusterDocUpdatesPushed skips re-merging when compressed flag is present', t => {
  const doc = new YDoc();
  const rawUpdates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => rawUpdates.push(u));
  doc.getText('content').insert(0, 'hello');
  doc.getText('content').insert(5, ' world');
  t.is(rawUpdates.length, 2);

  const emitted: Array<{ event: string; payload: any }> = [];
  const fakeSocket = {
    id: 'sock-1',
    emit(event: string, payload: any) {
      emitted.push({ event, payload });
    },
  };

  // Instantiate SpaceSyncGateway prototype without NestJS DI to test cluster handler in isolation
  const gateway = Object.create(SpaceSyncGateway.prototype) as any;
  gateway.event = {
    localChannel: 'canary',
    getCurrentOriginChannel: () => undefined,
  };
  gateway.activeDocSockets = new Map([
    ['workspace:ws-1:doc-1', new Set([fakeSocket])],
  ]);
  let buildBroadcastCalls = 0;
  gateway.buildBroadcastPayload = () => {
    buildBroadcastCalls += 1;
    throw new Error('should not re-merge pre-compressed cluster broadcast');
  };

  const preCompressedBase64 = Buffer.from(rawUpdates[0]).toString('base64');
  gateway.onClusterDocUpdatesPushed({
    spaceType: 'workspace',
    spaceId: 'ws-1',
    docId: 'doc-1',
    updates: [preCompressedBase64],
    timestamp: 123456,
    editor: 'editor-1',
    compressed: true,
  });

  t.is(buildBroadcastCalls, 0);
  t.is(emitted.length, 1);
  t.is(emitted[0].event, 'space:broadcast-doc-updates');
  t.deepEqual(emitted[0].payload, {
    spaceType: 'workspace',
    spaceId: 'ws-1',
    docId: 'doc-1',
    updates: [preCompressedBase64],
    timestamp: 123456,
    editor: 'editor-1',
    compressed: true,
  });
});

test('onClusterDocUpdatesPushed broadcasts doc invalidation only for remote origin channels', t => {
  const cases = [
    {
      name: 'remote payload originChannel',
      payloadOriginChannel: 'beta',
      currentOriginChannel: undefined,
      expectBroadcast: true,
    },
    {
      name: 'local payload originChannel',
      payloadOriginChannel: 'canary',
      currentOriginChannel: undefined,
      expectBroadcast: false,
    },
    {
      name: 'remote current originChannel fallback',
      payloadOriginChannel: undefined,
      currentOriginChannel: 'beta',
      expectBroadcast: true,
    },
    {
      name: 'missing originChannel',
      payloadOriginChannel: undefined,
      currentOriginChannel: undefined,
      expectBroadcast: false,
    },
  ];

  for (const tc of cases) {
    const roomEmissions: Array<{ room: string; event: string; payload: any }> =
      [];
    const gateway = Object.create(SpaceSyncGateway.prototype) as any;
    gateway.event = {
      localChannel: 'canary',
      getCurrentOriginChannel: () => tc.currentOriginChannel,
    };
    gateway.server = {
      local: {
        to(room: string) {
          return {
            emit(event: string, payload: any) {
              roomEmissions.push({ room, event, payload });
            },
          };
        },
      },
    };
    gateway.activeDocSockets = new Map();

    gateway.onClusterDocUpdatesPushed({
      spaceType: 'workspace',
      spaceId: 'ws-1',
      docId: 'doc-1',
      updates: [],
      timestamp: 123456,
      editor: 'editor-1',
      compressed: true,
      originChannel: tc.payloadOriginChannel,
    });

    if (tc.expectBroadcast) {
      t.deepEqual(
        roomEmissions,
        [
          {
            room: 'workspace:ws-1:sync-027',
            event: 'space:broadcast-doc-invalidation',
            payload: {
              spaceType: 'workspace',
              spaceId: 'ws-1',
              timestamp: 123456,
            },
          },
        ],
        tc.name
      );
    } else {
      t.deepEqual(roomEmissions, [], tc.name);
    }
  }
});
