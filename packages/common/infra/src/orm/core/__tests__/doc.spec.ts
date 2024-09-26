import {
  beforeEach,
  describe,
  expect,
  test as vitest,
  type TestAPI,
} from 'vitest';

import {
  createORMClient,
  type DBSchemaBuilder,
  f,
  MemoryORMAdapter,
  t,
  Table,
} from '../';

const TEST_SCHEMA = {
  docProperties: t.document({
    docId: f.string().primaryKey(),
  }),
} satisfies DBSchemaBuilder;

const ORMClient = createORMClient(TEST_SCHEMA);

type Context = {
  client: InstanceType<typeof ORMClient>;
};

beforeEach<Context>(async t => {
  t.client = new ORMClient(new MemoryORMAdapter());
});

const test = vitest as TestAPI<Context>;

describe('ORM entity CRUD', () => {
  test('still have type check', t => {
    const { client } = t;

    expect(() =>
      // @ts-expect-error type test
      client.docProperties.create({
        // docId missed
        prop1: 'prop1:value',
        prop2: 'prop2:value',
      })
    ).toThrow();
  });

  test('should be able to create ORM client', t => {
    const { client } = t;

    expect(client.docProperties instanceof Table).toBe(true);
  });

  test('should be able to create entity', async t => {
    const { client } = t;

    const doc = client.docProperties.create({
      docId: '1',
      prop1: 'prop1:value',
      prop2: 'prop2:value',
    });

    expect(doc.docId).toBe('1');
    expect(doc.prop1).toBe('prop1:value');
    expect(doc.prop2).toBe('prop2:value');
  });

  test('should be able to read entity', async t => {
    const { client } = t;

    const doc = client.docProperties.create({
      docId: '1',
      prop1: 'prop1:value',
      prop2: 'prop2:value',
    });

    const doc2 = client.docProperties.get(doc.docId);

    expect(doc2).toStrictEqual(doc);
  });

  test('should be able to update entity', async t => {
    const { client } = t;

    const doc = client.docProperties.create({
      docId: '1',
      prop1: 'prop1:value',
      prop2: 'prop2:value',
    });

    client.docProperties.update(doc.docId, {
      prop1: 'prop1:value2',
      prop3: 'prop3:value',
      prop4: null,
      prop5: undefined,
    });

    const doc2 = client.docProperties.get(doc.docId);

    expect(doc2).toStrictEqual({
      docId: '1',
      prop1: 'prop1:value2',
      prop2: 'prop2:value',
      prop3: 'prop3:value',
      prop4: null,
      prop5: undefined,
    });
  });

  test('should be able to delete entity', async t => {
    const { client } = t;

    const doc = client.docProperties.create({
      docId: '1',
      prop1: 'prop1:value',
      prop2: 'prop2:value',
    });

    client.docProperties.delete(doc.docId);

    const doc2 = client.docProperties.get(doc.docId);

    expect(doc2).toBe(null);
  });
});
