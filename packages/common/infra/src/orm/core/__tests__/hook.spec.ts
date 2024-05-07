import { nanoid } from 'nanoid';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test as t,
  type TestAPI,
} from 'vitest';

import {
  createORMClientType,
  type DBSchemaBuilder,
  type Entity,
  f,
  MemoryORMAdapter,
} from '../';

const TEST_SCHEMA = {
  tags: {
    id: f.string().primaryKey().default(nanoid),
    name: f.string(),
    color: f.string().optional(),
    colors: f.json<string[]>().optional(),
  },
  badges: {
    id: f.string().primaryKey().default(nanoid),
    color: f.string(),
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
  client: InstanceType<typeof Client>;
};

beforeEach<Context>(async t => {
  t.client = new Client(new MemoryORMAdapter());
  await t.client.connect();
});

afterEach<Context>(async t => {
  await t.client.disconnect();
});

const test = t as TestAPI<Context>;

describe('ORM hook mixin', () => {
  test('create entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    expect(tag.colors).toStrictEqual(['red']);
  });

  test('read entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    const tag2 = client.tags.get(tag.id);
    expect(tag2.colors).toStrictEqual(['red']);
  });

  test('update entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    const tag2 = client.tags.update(tag.id, { color: 'blue' });
    expect(tag2.colors).toStrictEqual(['blue']);
  });

  test('subscribe entity', t => {
    const { client } = t;

    let tag: Entity<(typeof TEST_SCHEMA)['tags']> | null = null;
    const subscription = client.tags.get$('test').subscribe(data => {
      tag = data;
    });

    client.tags.create({
      id: 'test',
      name: 'test',
      color: 'red',
    });

    expect(tag!.colors).toStrictEqual(['red']);
    client.tags.update(tag!.id, { color: 'blue' });
    expect(tag!.colors).toStrictEqual(['blue']);
    subscription.unsubscribe();
  });

  test('should not run hook on unrelated entity', t => {
    const { client } = t;

    const badge = client.badges.create({
      color: 'red',
    });

    // @ts-expect-error test
    expect(badge.colors).toBeUndefined();
  });

  test('should not touch the data in storage', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    expect(tag.colors).toStrictEqual(['red']);

    // @ts-expect-error private
    const rawTag = client.tags.adapter.data.get(tag.id);
    expect(rawTag.color).toBe('red');
    expect(rawTag.colors).toBe(null);
  });
});
