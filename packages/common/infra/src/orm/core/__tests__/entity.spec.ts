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
  f,
  MemoryORMAdapter,
  Table,
} from '../';

const TEST_SCHEMA = {
  tags: {
    id: f.string().primaryKey().default(nanoid),
    name: f.string(),
    color: f.string(),
  },
} satisfies DBSchemaBuilder;

const Client = createORMClientType(TEST_SCHEMA);
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

describe('ORM entity CRUD', () => {
  test('should be able to create ORM client', t => {
    const { client } = t;

    expect(client.tags instanceof Table).toBe(true);
  });

  test('should be able to create entity', async t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    expect(tag.id).toBeDefined();
    expect(tag.name).toBe('test');
    expect(tag.color).toBe('red');
  });

  test('should be able to read entity', async t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    const tag2 = client.tags.get(tag.id);
    expect(tag2).toEqual(tag);
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

  test('should be able to update entity', async t => {
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

  test('should be able to delete entity', async t => {
    const { client } = t;

    const tag = client.tags.create({
      name: 'test',
      color: 'red',
    });

    client.tags.delete(tag.id);

    const tag2 = client.tags.get(tag.id);
    expect(tag2).toBe(null);
  });
});
