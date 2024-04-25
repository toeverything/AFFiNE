import { nanoid } from 'nanoid';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test as t,
  type TestAPI,
} from 'vitest';
import { Doc } from 'yjs';

import {
  createORMClientType,
  type DBSchemaBuilder,
  type DocProvider,
  type Entity,
  f,
  Table,
  YjsDBAdapter,
} from '../';

const TEST_SCHEMA = {
  tags: {
    id: f.string().primaryKey().default(nanoid),
    name: f.string(),
    color: f.string(),
  },
} satisfies DBSchemaBuilder;

const docProvider: DocProvider = {
  getDoc(guid: string) {
    return new Doc({ guid });
  },
};

const Client = createORMClientType(TEST_SCHEMA);
type Context = {
  client: InstanceType<typeof Client>;
};

beforeEach<Context>(async t => {
  t.client = new Client(new YjsDBAdapter(docProvider));
  await t.client.connect();
});

afterEach<Context>(async t => {
  await t.client.disconnect();
});

const test = t as TestAPI<Context>;

describe('ORM entity CRUD', () => {
  test('should be able to create ORM client', t => {
    const { client } = t;

    expect(client.tags instanceof Table).toBe(true);
  });

  test('should be able to create entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    expect(tag.id).toBeDefined();
    expect(tag.name).toBe('test');
    expect(tag.color).toBe('red');
  });

  test('should be able to read entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    const tag2 = client.tags.get(tag.id);
    expect(tag2).toEqual(tag);
  });

  test('should be able to update entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    client.tags.update(tag.id, {
      name: 'test2',
    });

    const tag2 = client.tags.get(tag.id);
    expect(tag2).toEqual({
      id: tag.id,
      name: 'test2',
      color: 'red',
    });

    // old tag should not be updated
    expect(tag.name).not.toBe(tag2.name);
  });

  test('should be able to delete entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    client.tags.delete(tag.id);

    const tag2 = client.tags.get(tag.id);
    expect(tag2).toBe(null);
  });

  test('should be able to list keys', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    expect(client.tags.keys()).toStrictEqual([tag.id]);

    client.tags.delete(tag.id);
    expect(client.tags.keys()).toStrictEqual([]);
  });

  test('should be able to subscribe to entity changes', t => {
    const { client } = t;

    let tag: Entity<(typeof TEST_SCHEMA)['tags']> | null = null;
    const subscription1 = client.tags.get$('test').subscribe(data => {
      tag = data;
    });

    const subscription2 = client.tags.get$('test').subscribe(_ => {});

    expect(tag).toBe(null);

    // create
    client.tags.create({
      id: 'test',
      name: 'testTag',
      color: 'blue',
    });

    expect(tag!.id).toEqual('test');
    expect(tag!.color).toEqual('blue');

    client.tags.update('test', {
      color: 'red',
    });
    expect(tag!.color).toEqual('red');

    client.tags.delete('test');
    expect(tag).toBe(null);

    // internal status
    subscription1.unsubscribe();
    // @ts-expect-error private field
    expect(client.tags.subscribedKeys.size).toBe(1);

    subscription2.unsubscribe();
    // @ts-expect-error private field
    expect(client.tags.subscribedKeys.size).toBe(0);
  });

  test('should be able to subscribe to entity key list', t => {
    const { client } = t;

    let keys: string[] = [];
    const subscription = client.tags.keys$().subscribe(data => {
      keys = data;
    });

    client.tags.create({
      id: 'test',
      name: 'testTag',
      color: 'blue',
    });

    expect(keys).toStrictEqual(['test']);

    client.tags.update('test', { color: 'red' });
    expect(keys).toStrictEqual(['test']);

    client.tags.delete('test');
    expect(keys).toStrictEqual([]);

    subscription.unsubscribe();
  });

  test('can not use reserved keyword as field name', () => {
    const Client = createORMClientType({
      tags: {
        $$KEY: f.string().primaryKey().default(nanoid),
      },
    });

    expect(() =>
      new Client(new YjsDBAdapter(docProvider)).connect()
    ).rejects.toThrow(
      "[Table(tags)]: Field '$$KEY' is reserved keyword and can't be used"
    );
  });
});
