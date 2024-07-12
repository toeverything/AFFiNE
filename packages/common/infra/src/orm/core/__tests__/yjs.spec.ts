import { nanoid } from 'nanoid';
import { beforeEach, describe, expect, test as t, type TestAPI } from 'vitest';
import { Doc } from 'yjs';

import {
  createORMClient,
  type DBSchemaBuilder,
  type DocProvider,
  type Entity,
  f,
  Table,
  YjsDBAdapter,
} from '../';

function incremental() {
  let i = 0;
  return () => i++;
}

const TEST_SCHEMA = {
  tags: {
    id: f.string().primaryKey().default(nanoid),
    name: f.string(),
    color: f.string(),
  },
  users: {
    id: f.number().primaryKey().default(incremental()),
    name: f.string(),
  },
} satisfies DBSchemaBuilder;

const docProvider: DocProvider = {
  getDoc(guid: string) {
    return new Doc({ guid });
  },
};

const Client = createORMClient(TEST_SCHEMA);
type Context = {
  client: InstanceType<typeof Client>;
};

beforeEach<Context>(async t => {
  t.client = new Client(new YjsDBAdapter(TEST_SCHEMA, docProvider));
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

    const user = client.users.create({
      name: 'user1',
    });

    expect(typeof user.id).toBe('number');
    expect(user.name).toBe('user1');
  });

  test('should be able to read entity', t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    const tag2 = client.tags.get(tag.id);
    expect(tag2).toEqual(tag);

    const user = client.users.create({
      name: 'user1',
    });
    const user2 = client.users.get(user.id);
    expect(user2).toEqual(user);
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
    expect(tag.name).not.toBe(tag2!.name);
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

  test('should be able to recover entity', t => {
    const { client } = t;

    client.tags.create({
      id: '1',
      name: 'test',
      color: 'red',
    });

    client.tags.delete('1');

    client.tags.create({
      id: '1',
      name: 'test',
      color: 'red',
    });

    const tag = client.tags.get('1');
    expect(tag).toEqual({
      id: '1',
      name: 'test',
      color: 'red',
    });
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

  test('should be able to subscribe to filtered entity changes', t => {
    const { client } = t;

    let entities: any[] = [];
    const subscription = client.tags.find$({ name: 'test' }).subscribe(data => {
      entities = data;
    });

    const tag1 = client.tags.create({
      id: '1',
      name: 'test',
      color: 'red',
    });

    expect(entities).toStrictEqual([tag1]);

    const tag2 = client.tags.create({
      id: '2',
      name: 'test',
      color: 'blue',
    });

    expect(entities).toStrictEqual([tag1, tag2]);

    subscription.unsubscribe();
  });

  test('should be able to subscription to any entity changes', t => {
    const { client } = t;

    let entities: any[] = [];
    const subscription = client.tags.find$({}).subscribe(data => {
      entities = data;
    });

    const tag1 = client.tags.create({
      id: '1',
      name: 'tag1',
      color: 'red',
    });

    expect(entities).toStrictEqual([tag1]);

    const tag2 = client.tags.create({
      id: '2',
      name: 'tag2',
      color: 'blue',
    });

    expect(entities).toStrictEqual([tag1, tag2]);

    subscription.unsubscribe();
  });

  test('can not use reserved keyword as field name', () => {
    expect(
      () =>
        new YjsDBAdapter(
          {
            tags: {
              $$DELETED: f.string().primaryKey().default(nanoid),
            },
          },
          docProvider
        )
    ).toThrow(
      "[Table(tags)]: Field '$$DELETED' is reserved keyword and can't be used"
    );
  });
});
