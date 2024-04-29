import { nanoid } from 'nanoid';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test as t,
  type TestAPI,
  vitest,
} from 'vitest';
import { Doc } from 'yjs';

import { DocEngine } from '../../../sync';
import { MiniSyncServer } from '../../../sync/doc/__tests__/utils';
import { MemoryStorage } from '../../../sync/doc/storage';
import {
  createORMClientType,
  type DBSchemaBuilder,
  f,
  YjsDBAdapter,
} from '../';

const TEST_SCHEMA = {
  tags: {
    id: f.string().primaryKey().default(nanoid),
    name: f.string(),
    color: f.string().optional(),
    colors: f.json<string[]>().optional(),
  },
} satisfies DBSchemaBuilder;

const Client = createORMClientType(TEST_SCHEMA);

// define the hooks
Client.defineHook('tags', 'migrate field `color` to field `colors`', {
  deserialize(data) {
    if (!data.colors && data.color) {
      data.colors = [data.color];
    }

    return data;
  },
});

type Context = {
  server: MiniSyncServer;
  user1: {
    client: InstanceType<typeof Client>;
    engine: DocEngine;
  };
  user2: {
    client: InstanceType<typeof Client>;
    engine: DocEngine;
  };
};

function createEngine(server: MiniSyncServer) {
  return new DocEngine(new MemoryStorage(), server.client());
}

async function createClient(server: MiniSyncServer, clientId: number) {
  const engine = createEngine(server);
  const client = new Client(
    new YjsDBAdapter({
      getDoc(guid: string) {
        const doc = new Doc({ guid });
        doc.clientID = clientId;
        engine.addDoc(doc);
        return doc;
      },
    })
  );

  return {
    engine,
    client,
  };
}

beforeEach<Context>(async t => {
  t.server = new MiniSyncServer();
  // we set user2's clientId greater than user1's clientId,
  // so all conflicts will be resolved to user2's changes
  t.user1 = await createClient(t.server, 1);
  t.user2 = await createClient(t.server, 2);

  t.user1.engine.start();
  await t.user1.client.connect();
  t.user2.engine.start();
  await t.user2.client.connect();
});

afterEach<Context>(async t => {
  t.user1.client.disconnect();
  t.user2.client.disconnect();
  t.user1.engine.stop();
  t.user2.engine.stop();
});

const test = t as TestAPI<Context>;

describe('ORM compatibility in synchronization scenerio', () => {
  test('2 clients create at the same time', async t => {
    const { user1, user2 } = t;
    const tag1 = user1.client.tags.create({
      name: 'tag1',
      color: 'blue',
    });

    const tag2 = user2.client.tags.create({
      name: 'tag2',
      color: 'red',
    });

    await vitest.waitFor(() => {
      expect(user1.client.tags.keys()).toHaveLength(2);
      expect(user2.client.tags.keys()).toHaveLength(2);
    });

    expect(user2.client.tags.get(tag1.id)).toStrictEqual(tag1);
    expect(user1.client.tags.get(tag2.id)).toStrictEqual(tag2);
  });

  test('2 clients updating the same entity', async t => {
    const { user1, user2 } = t;
    const tag = user1.client.tags.create({
      name: 'tag1',
      color: 'blue',
    });

    await vitest.waitFor(() => {
      expect(user2.client.tags.keys()).toHaveLength(1);
    });

    user1.client.tags.update(tag.id, { color: 'red' });
    user2.client.tags.update(tag.id, { color: 'gray' });

    await vitest.waitFor(() => {
      expect(user1.client.tags.get(tag.id)).toHaveProperty('color', 'gray');
      expect(user2.client.tags.get(tag.id)).toHaveProperty('color', 'gray');
    });
  });
});
