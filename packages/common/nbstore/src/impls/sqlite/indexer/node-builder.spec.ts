import { describe, expect, it, vi } from 'vitest';

import type { NativeDBConnection } from '../db';
import { SqliteIndexerStorage } from '.';
import { createNode } from './node-builder';
import { getText } from './utils';

const query = { type: 'match', field: 'title', match: 'query' } as const;

const connectionWith = (value: unknown) =>
  ({
    apis: {
      ftsGetDocument: vi.fn().mockResolvedValue(value),
      ftsGetMatches: vi.fn().mockResolvedValue([]),
    },
  }) as unknown as NativeDBConnection;

describe('sqlite indexer node fields', () => {
  it.each([
    ['string', 'summary', 'summary'],
    ['singleton array', ['one'], 'one'],
    ['array', ['one', 'two'], ['one', 'two']],
    ['serialized array', '["one","two"]', ['one', 'two']],
    ['malformed array', '[not-json]', '[not-json]'],
    ['null', null, ''],
    ['missing', undefined, ''],
    ['wrong type', 42, ''],
  ])('isolates %s values', async (_, value, expected) => {
    const node = await createNode(
      connectionWith(Array.isArray(value) ? getText(value) : value),
      'doc',
      'doc-id',
      1,
      { fields: ['title'] },
      query
    );

    expect(node.fields.title).toEqual(expected);
  });

  it('does not highlight non-string values', async () => {
    const connection = connectionWith({ invalid: true });
    const node = await createNode(
      connection,
      'doc',
      'doc-id',
      1,
      { highlights: [{ field: 'title', before: '<b>', end: '</b>' }] },
      query
    );

    expect(node.highlights.title).toEqual([]);
    expect(connection.apis.ftsGetMatches).not.toHaveBeenCalled();
  });

  it('isolates wrong aggregate field types', async () => {
    const connection = connectionWith(42);
    connection.apis.ftsSearch = vi
      .fn()
      .mockResolvedValue([{ id: 'doc-id', score: 1, terms: [] }]);
    const storage = Object.create(
      SqliteIndexerStorage.prototype
    ) as SqliteIndexerStorage;
    Object.defineProperty(storage, 'connection', { value: connection });

    await expect(
      storage.aggregate('doc', query, 'title')
    ).resolves.toMatchObject({ buckets: [] });
  });
});
