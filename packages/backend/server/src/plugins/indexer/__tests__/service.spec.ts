import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import test from 'ava';
import { omit, pick } from 'lodash-es';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { ConfigModule } from '../../../base/config';
import { ServerConfigModule } from '../../../core/config';
import { IndexerModule, IndexerService } from '..';
import { SearchProviderFactory } from '../factory';
import { ManticoresearchProvider } from '../providers';
import { UpsertDoc } from '../service';
import { SearchTable } from '../tables';
import {
  AggregateInput,
  SearchInput,
  SearchQueryOccur,
  SearchQueryType,
} from '../types';

const module = await createModule({
  imports: [
    IndexerModule,
    ServerConfigModule,
    ConfigModule.override({
      indexer: {
        enabled: true,
      },
    }),
  ],
  providers: [IndexerService],
});
const indexerService = module.get(IndexerService);
const searchProviderFactory = module.get(SearchProviderFactory);
const manticoresearch = module.get(ManticoresearchProvider);
const user = await module.create(Mockers.User);
const workspace = await module.create(Mockers.Workspace, {
  snapshot: true,
  owner: user,
});

mock.method(searchProviderFactory, 'get', () => {
  return manticoresearch;
});

test.after.always(async () => {
  await module.close();
});

test.before(async () => {
  await indexerService.createTables();
});

test.afterEach.always(async () => {
  await indexerService.deleteByQuery(
    SearchTable.doc,
    {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspace.id,
    },
    {
      refresh: true,
    }
  );
  await indexerService.deleteByQuery(
    SearchTable.block,
    {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspace.id,
    },
    {
      refresh: true,
    }
  );
});

// #region deleteByQuery()

test('should deleteByQuery work', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId: workspace.id,
        docId: docId1,
        blockId: randomUUID(),
        content: 'hello world',
        flavour: 'affine:page',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId: workspace.id,
        docId: docId2,
        blockId: randomUUID(),
        content: 'hello world',
        flavour: 'affine:page',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  let result = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.should,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    options: {
      fields: ['docId'],
    },
  });

  t.is(result.total, 2);
  t.is(result.nodes.length, 2);

  await indexerService.deleteByQuery(
    SearchTable.block,
    {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.should,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    {
      refresh: true,
    }
  );

  result = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    options: {
      fields: ['docId'],
    },
  });

  t.is(result.total, 0);
  t.is(result.nodes.length, 0);
});

// #endregion

// #region write()

test('should write throw error when field type wrong', async t => {
  await t.throwsAsync(
    indexerService.write(SearchTable.block, [
      {
        workspaceId: workspace.id,
        docId: 'docId1',
        blockId: randomUUID(),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        content: 'hello world',
        flavour: 'affine:page',
        // @ts-expect-error test error
        refDocId: 123,
      },
    ]),
    {
      message: /ref_doc_id/,
    }
  );
});

test('should write block with array content work', async t => {
  const docId = randomUUID();
  const blockId = randomUUID();
  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId: workspace.id,
        docId,
        blockId,
        content: ['hello', 'world'],
        flavour: 'affine:page',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.match,
          field: 'content',
          match: 'hello world',
        },
      ],
    },
    options: {
      fields: ['content'],
    },
  });

  t.is(result.total, 1);
  t.is(result.nodes.length, 1);
  t.snapshot(
    result.nodes.map(node => ({
      fields: node.fields,
    }))
  );
});

test('should write 10k docs work', async t => {
  const docCount = 10000;
  const docs: UpsertDoc[] = [];
  for (let i = 0; i < docCount; i++) {
    docs.push({
      workspaceId: workspace.id,
      docId: randomUUID(),
      title: `hello world ${i} ${randomUUID()}`,
      summary: `this is a test ${i} ${randomUUID()}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await indexerService.write(SearchTable.doc, docs);

  // cleanup
  await indexerService.deleteByQuery(
    SearchTable.doc,
    {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspace.id,
    },
    {
      refresh: true,
    }
  );

  t.pass();
});

test('should write ref as string[] work', async t => {
  const docIds = [randomUUID(), randomUUID(), randomUUID()];

  await indexerService.write(
    SearchTable.block,
    [
      {
        docId: docIds[0],
        workspaceId: workspace.id,
        content: 'test1',
        flavour: 'markdown',
        blockId: randomUUID(),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-04-22T00:00:00.000Z'),
        updatedAt: new Date('2025-04-22T00:00:00.000Z'),
      },
      {
        docId: docIds[1],
        workspaceId: workspace.id,
        content: 'test2',
        flavour: 'markdown',
        blockId: randomUUID(),
        refDocId: [docIds[0]],
        ref: ['{"foo": "bar1"}'],
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2021-04-22T00:00:00.000Z'),
        updatedAt: new Date('2021-04-22T00:00:00.000Z'),
      },
      {
        docId: docIds[2],
        workspaceId: workspace.id,
        content: 'test3',
        flavour: 'markdown',
        blockId: randomUUID(),
        refDocId: [docIds[0], docIds[2]],
        ref: ['{"foo": "bar1"}', '{"foo": "bar3"}'],
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-03-22T00:00:00.000Z'),
        updatedAt: new Date('2025-03-22T00:00:00.000Z'),
      },
      {
        docId: docIds[0],
        workspaceId: workspace.id,
        content: 'test4',
        flavour: 'markdown',
        blockId: randomUUID(),
        refDocId: [docIds[0], docIds[2]],
        ref: ['{"foo": "bar1"}', '{"foo": "bar3"}'],
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-04-22T00:00:00.000Z'),
        updatedAt: new Date('2025-04-22T00:00:00.000Z'),
      },
    ],
    {
      refresh: true,
    }
  );

  t.pass();
});

// #endregion

// #region parseInput()

test('should parse all query work', async t => {
  const input = {
    table: SearchTable.block,
    query: { type: SearchQueryType.all },
    options: {
      fields: ['flavour', 'docId', 'refDocId'],
    },
  };

  const result = indexerService.parseInput(input);

  t.snapshot(result);
});

test('should parse exists query work', async t => {
  const input = {
    table: SearchTable.block,
    query: { type: SearchQueryType.exists, field: 'refDocId' },
    options: {
      fields: ['flavour', 'docId', 'refDocId'],
    },
  };

  const result = indexerService.parseInput(input);

  t.snapshot(result);
});

test('should parse boost query work', async t => {
  const input = {
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boost,
      boost: 1.5,
      query: {
        type: SearchQueryType.match,
        field: 'flavour',
        match: 'affine:page',
      },
    },
    options: {
      fields: ['flavour', 'docId', 'refDocId'],
    },
  };

  const result = indexerService.parseInput(input);

  t.snapshot(result);
});

test('should parse match query work', async t => {
  const input = {
    table: SearchTable.block,
    query: {
      type: SearchQueryType.match,
      field: 'flavour',
      match: 'affine:page',
    },
    options: {
      fields: [
        'flavour',
        'docId',
        'refDocId',
        'parentFlavour',
        'parentBlockId',
        'additional',
        'markdownPreview',
        'createdByUserId',
        'updatedByUserId',
        'createdAt',
        'updatedAt',
      ],
    },
  };

  const result = indexerService.parseInput(input);

  t.snapshot(result);
});

test('should parse boolean query work', async t => {
  const input = {
    table: SearchTable.block,
    query: {
      type: 'boolean',
      occur: 'must',
      queries: [
        {
          type: 'match',
          field: 'workspaceId',
          match: 'workspaceId1',
        },
        {
          type: 'match',
          field: 'content',
          match: 'hello',
        },
        {
          type: 'boolean',
          occur: 'should',
          queries: [
            {
              type: 'match',
              field: 'content',
              match: 'hello',
            },
            {
              type: 'boost',
              boost: 1.5,
              query: {
                type: 'match',
                field: 'flavour',
                match: 'affine:page',
              },
            },
          ],
        },
      ],
    },
    options: {
      fields: [
        'flavour',
        'docId',
        'refDocId',
        'parentFlavour',
        'parentBlockId',
        'additional',
        'markdownPreview',
        'createdByUserId',
        'updatedByUserId',
        'createdAt',
        'updatedAt',
      ],
    },
  };

  const result = indexerService.parseInput(input as SearchInput);

  t.snapshot(result);
});

test('should parse search input highlight work', async t => {
  const input = {
    table: SearchTable.block,
    query: {
      type: SearchQueryType.all,
    },
    options: {
      fields: ['flavour', 'docId', 'refDocId'],
      highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
    },
  };

  const result = indexerService.parseInput(input as SearchInput);

  t.snapshot(result);
});

test('should parse aggregate input highlight work', async t => {
  const input = {
    table: SearchTable.doc,
    field: 'flavour',
    query: {
      type: SearchQueryType.all,
    },
    options: {
      hits: {
        fields: ['flavour', 'docId', 'refDocId'],
        highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
      },
    },
  };

  const result = indexerService.parseInput(input as AggregateInput);

  t.snapshot(result);
});

// #endregion

// #region search()

test('should search work', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  await indexerService.write(
    SearchTable.doc,
    [
      {
        workspaceId: workspace.id,
        title: 'hello world',
        summary: 'this is a test',
        docId: docId1,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId: workspace.id,
        title: '你好世界',
        summary: '这是测试',
        docId: docId2,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  let result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.match,
          field: 'title',
          match: 'hello hello',
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
      highlights: [{ field: 'title', before: '<b>', end: '</b>' }],
    },
  });

  t.truthy(result.nextCursor);
  t.is(result.total, 1);
  t.is(result.nodes.length, 1);
  t.snapshot(
    result.nodes.map(node => ({
      fields: omit(node.fields, 'workspaceId', 'docId'),
      highlights: node.highlights,
    }))
  );
  t.deepEqual(result.nodes[0]._source, {
    workspaceId: workspace.id,
    docId: docId1,
  });

  result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.match,
          field: 'title',
          match: '你好你好',
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
      highlights: [{ field: 'title', before: '<b>', end: '</b>' }],
    },
  });

  t.truthy(result.nextCursor);
  t.is(result.total, 1);
  t.is(result.nodes.length, 1);
  t.snapshot(
    result.nodes.map(node => ({
      fields: omit(node.fields, 'workspaceId', 'docId'),
      highlights: node.highlights,
    }))
  );
  t.deepEqual(result.nodes[0]._source, {
    workspaceId: workspace.id,
    docId: docId2,
  });
});

test('should throw error when limit is greater than 10000', async t => {
  await t.throwsAsync(
    indexerService.search({
      table: SearchTable.doc,
      query: {
        type: SearchQueryType.all,
      },
      options: {
        fields: ['workspaceId', 'docId', 'title', 'summary'],
        pagination: {
          limit: 10001,
        },
      },
    }),
    {
      message: 'Invalid indexer input: limit must be less than 10000',
    }
  );
});

test('should search with exists query work', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId: workspace.id,
        docId: docId1,
        blockId: 'blockId1',
        content: 'hello world',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        flavour: 'affine:page',
        parentBlockId: 'blockId2',
      },
      {
        workspaceId: workspace.id,
        docId: docId2,
        blockId: 'blockId2',
        content: 'hello world',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-24T00:00:00.000Z'),
        flavour: 'affine:page',
        refDocId: [docId1],
        ref: ['{"type": "affine:page", "id": "docId1"}'],
      },
      {
        workspaceId: workspace.id,
        docId: docId3,
        blockId: 'blockId3',
        content: 'hello world',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        flavour: 'affine:page',
        refDocId: [docId2, docId1],
        ref: [
          '{"type": "affine:page", "id": "docId2"}',
          '{"type": "affine:page", "id": "docId1"}',
        ],
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.boolean,
          occur: SearchQueryOccur.must,
          queries: [
            {
              type: SearchQueryType.boolean,
              occur: SearchQueryOccur.should,
              queries: [docId1, docId2, docId3].map(docId => ({
                type: SearchQueryType.match,
                field: 'docId',
                match: docId,
              })),
            },
            {
              type: SearchQueryType.exists,
              field: 'refDocId',
            },
          ],
        },
      ],
    },
    options: {
      fields: ['blockId', 'refDocId', 'ref'],
    },
  });

  t.is(result.total, 2);
  t.is(result.nodes.length, 2);
  t.deepEqual(result.nodes[0].fields, {
    blockId: ['blockId3'],
    refDocId: [docId2, docId1],
    ref: [
      '{"type": "affine:page", "id": "docId2"}',
      '{"type": "affine:page", "id": "docId1"}',
    ],
  });
  t.deepEqual(result.nodes[1].fields, {
    blockId: ['blockId2'],
    refDocId: [docId1],
    ref: ['{"type": "affine:page", "id": "docId1"}'],
  });

  const result2 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.boolean,
          occur: SearchQueryOccur.must,
          queries: [
            {
              type: SearchQueryType.boolean,
              occur: SearchQueryOccur.should,
              queries: [docId1, docId2, docId3].map(docId => ({
                type: SearchQueryType.match,
                field: 'docId',
                match: docId,
              })),
            },
            {
              type: SearchQueryType.exists,
              field: 'parentBlockId',
            },
          ],
        },
      ],
    },
    options: {
      fields: ['blockId', 'refDocId', 'ref', 'parentBlockId'],
    },
  });

  t.is(result2.total, 1);
  t.is(result2.nodes.length, 1);
  t.snapshot(
    result2.nodes.map(node => ({
      fields: node.fields,
    }))
  );
});

test('should get all title and docId from doc table', async t => {
  const docIds: string[] = [];
  for (let i = 0; i < 10101; i++) {
    docIds.push(randomUUID());
  }
  await indexerService.write(
    SearchTable.doc,
    docIds.map(docId => ({
      workspaceId: workspace.id,
      docId,
      title: `hello world ${docId}`,
      summary: `this is a test ${docId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    {
      refresh: true,
    }
  );

  let result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.all,
        },
      ],
    },
    options: {
      fields: ['title', 'docId'],
      pagination: {
        limit: 10000,
      },
    },
  });

  const searchDocIds: string[] = [];
  for (const node of result.nodes) {
    searchDocIds.push(node.fields.docId[0] as string);
  }
  while (result.nextCursor) {
    result = await indexerService.search({
      table: SearchTable.doc,
      query: {
        type: SearchQueryType.boolean,
        occur: SearchQueryOccur.must,
        queries: [
          {
            type: SearchQueryType.match,
            field: 'workspaceId',
            match: workspace.id,
          },
          {
            type: SearchQueryType.all,
          },
        ],
      },
      options: {
        fields: ['title', 'docId'],
        pagination: {
          limit: 10000,
          cursor: result.nextCursor,
        },
      },
    });
    for (const node of result.nodes) {
      searchDocIds.push(node.fields.docId[0] as string);
    }
  }

  t.is(searchDocIds.length, docIds.length);
  t.deepEqual(searchDocIds.sort(), docIds.sort());
});

test('should search with bool must multiple conditions query work', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  const blockId1 = randomUUID();
  const blockId2 = randomUUID();
  const blockId3 = randomUUID();
  const blockId4 = randomUUID();
  const blockId5 = randomUUID();
  await indexerService.write(
    SearchTable.block,
    [
      // ref to docId1, ignore current docId1
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId1,
        blockId: blockId1,
        refDocId: [docId1],
        ref: ['{"foo": "bar1"}'],
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // ref to docId1, docId2, ignore current docId1
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId1,
        blockId: blockId2,
        refDocId: [docId1, docId2],
        ref: ['{"foo": "bar1"}', '{"foo": "bar2"}'],
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId2,
        blockId: blockId3,
        refDocId: [docId1, docId2],
        ref: ['{"foo": "bar1"}', '{"foo": "bar2"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId1',
        parentFlavour: 'affine:database',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-26T00:00:00.000Z'),
      },
      // matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId2,
        blockId: blockId4,
        refDocId: [docId1],
        ref: ['{"foo": "bar1"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId2',
        parentFlavour: 'affine:database',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-25T00:00:00.000Z'),
      },
      // matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId3,
        blockId: blockId5,
        refDocId: [docId2, docId1, docId3],
        ref: ['{"foo": "bar2"}', '{"foo": "bar1"}', '{"foo": "bar3"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId3',
        parentFlavour: 'affine:database',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-24T00:00:00.000Z'),
      },
      // not matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId3,
        blockId: 'blockId6',
        refDocId: [docId2, docId3],
        ref: ['{"foo": "bar2"}', '{"foo": "bar3"}'],
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // not matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId3,
        blockId: 'blockId7',
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // not matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId2,
        blockId: 'blockId8',
        refDocId: [docId1],
        ref: ['{"foo": "bar1"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId2',
        parentFlavour: 'affine:text',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-25T00:00:00.000Z'),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'refDocId',
          match: docId1,
        },
        {
          type: SearchQueryType.match,
          field: 'parentFlavour',
          match: 'affine:database',
        },
        // Ignore if it is a link to the current document.
        {
          type: SearchQueryType.boolean,
          occur: SearchQueryOccur.must_not,
          queries: [
            {
              type: SearchQueryType.match,
              field: 'docId',
              match: docId1,
            },
          ],
        },
      ],
    },
    options: {
      fields: ['docId', 'blockId', 'parentBlockId', 'additional'],
      pagination: {
        limit: 100,
      },
    },
  });

  t.is(result.total, 3);
  t.is(result.nodes.length, 3);
  t.deepEqual(result.nodes[0].fields, {
    docId: [docId2],
    blockId: [blockId3],
    parentBlockId: ['parentBlockId1'],
    additional: ['{"foo": "bar3"}'],
  });
  t.deepEqual(result.nodes[1].fields, {
    docId: [docId2],
    blockId: [blockId4],
    parentBlockId: ['parentBlockId2'],
    additional: ['{"foo": "bar3"}'],
  });
  t.deepEqual(result.nodes[2].fields, {
    docId: [docId3],
    blockId: [blockId5],
    parentBlockId: ['parentBlockId3'],
    additional: ['{"foo": "bar3"}'],
  });
});

test('should search a doc summary work', async t => {
  const docId1 = randomUUID();
  await indexerService.write(
    SearchTable.doc,
    [
      {
        workspaceId: workspace.id,
        docId: docId1,
        title: 'hello world, this is a title',
        summary: 'hello world, this is a summary',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
      ],
    },
    options: {
      fields: ['summary'],
    },
  });

  t.is(result.total, 1);
  t.is(result.nodes.length, 1);
  t.snapshot(
    result.nodes.map(node => ({
      fields: node.fields,
    }))
  );
});

// #endregion

// #region aggregate()

test('should aggregate work', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const blockId1 = randomUUID();
  const blockId2 = randomUUID();
  const blockId3 = randomUUID();
  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId1,
        blockId: blockId3,
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId: workspace.id,
        flavour: 'affine:text',
        docId: docId1,
        blockId: blockId1,
        content: 'hello world, this is a block',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId: workspace.id,
        flavour: 'affine:text',
        docId: docId1,
        blockId: randomUUID(),
        content: 'this is a block',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId: workspace.id,
        flavour: 'affine:text',
        docId: docId2,
        blockId: blockId2,
        content: 'hello world, this is a test block',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // not match
      {
        workspaceId: workspace.id,
        flavour: 'affine:database',
        docId: docId2,
        blockId: randomUUID(),
        content: 'this is a test block',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await indexerService.aggregate({
    table: SearchTable.block,
    field: 'docId',
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.boolean,
          occur: SearchQueryOccur.must,
          queries: [
            {
              type: SearchQueryType.match,
              field: 'content',
              match: 'hello',
            },
            {
              type: SearchQueryType.boolean,
              occur: SearchQueryOccur.should,
              queries: [
                {
                  type: SearchQueryType.match,
                  field: 'content',
                  match: 'hello',
                },
                {
                  type: SearchQueryType.boost,
                  boost: 1.5,
                  query: {
                    type: SearchQueryType.match,
                    field: 'flavour',
                    match: 'affine:page',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    options: {
      hits: {
        fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
        highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
      },
    },
  });

  t.is(result.total, 3);
  t.is(result.buckets.length, 2);
  t.deepEqual(result.buckets[0].key, docId1);
  t.is(result.buckets[0].count, 2);
  // match affine:page first
  t.deepEqual(result.buckets[0].hits.nodes[0].fields, {
    workspaceId: [workspace.id],
    docId: [docId1],
    blockId: [blockId3],
    content: ['hello world, this is a title'],
    flavour: ['affine:page'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[0].highlights, {
    content: ['<b>hello</b> world, this is a title'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[0]._source, {
    workspaceId: workspace.id,
    docId: docId1,
  });
  t.deepEqual(result.buckets[0].hits.nodes[1].fields, {
    workspaceId: [workspace.id],
    docId: [docId1],
    blockId: [blockId1],
    content: ['hello world, this is a block'],
    flavour: ['affine:text'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[1].highlights, {
    content: ['<b>hello</b> world, this is a block'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[1]._source, {
    workspaceId: workspace.id,
    docId: docId1,
  });
  t.deepEqual(result.buckets[1].key, docId2);
  t.is(result.buckets[1].count, 1);
  t.deepEqual(result.buckets[1].hits.nodes[0].fields, {
    workspaceId: [workspace.id],
    docId: [docId2],
    blockId: [blockId2],
    content: ['hello world, this is a test block'],
    flavour: ['affine:text'],
  });
  t.deepEqual(result.buckets[1].hits.nodes[0].highlights, {
    content: ['<b>hello</b> world, this is a test block'],
  });
  t.deepEqual(result.buckets[1].hits.nodes[0]._source, {
    workspaceId: workspace.id,
    docId: docId2,
  });
});

test('should aggregate with bool must_not query work', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  const blockId1 = randomUUID();
  const blockId2 = randomUUID();
  const blockId3 = randomUUID();
  const blockId4 = randomUUID();
  const blockId5 = randomUUID();
  await indexerService.write(
    SearchTable.block,
    [
      // ref to docId1, ignore current docId1
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId1,
        blockId: blockId1,
        refDocId: [docId1],
        ref: ['{"foo": "bar1"}'],
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // ref to docId1, docId2, ignore current docId1
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId1,
        blockId: blockId2,
        refDocId: [docId1, docId2],
        ref: ['{"foo": "bar1"}', '{"foo": "bar2"}'],
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId2,
        blockId: blockId3,
        refDocId: [docId1, docId2],
        ref: ['{"foo": "bar1"}', '{"foo": "bar2"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId1',
        parentFlavour: 'affine:database',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-26T00:00:00.000Z'),
      },
      // matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId2,
        blockId: blockId4,
        refDocId: [docId1],
        ref: ['{"foo": "bar1"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId2',
        parentFlavour: 'affine:database',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-25T00:00:00.000Z'),
      },
      // matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId3,
        blockId: blockId5,
        refDocId: [docId2, docId1, docId3],
        ref: ['{"foo": "bar2"}', '{"foo": "bar1"}', '{"foo": "bar3"}'],
        content: 'hello world, this is a title',
        parentBlockId: 'parentBlockId3',
        parentFlavour: 'affine:database',
        additional: '{"foo": "bar3"}',
        markdownPreview: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date('2025-04-24T00:00:00.000Z'),
      },
      // not matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId3,
        blockId: 'blockId6',
        refDocId: [docId2, docId3],
        ref: ['{"foo": "bar2"}', '{"foo": "bar3"}'],
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // not matched
      {
        workspaceId: workspace.id,
        flavour: 'affine:page',
        docId: docId3,
        blockId: 'blockId7',
        content: 'hello world, this is a title',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await indexerService.aggregate({
    table: SearchTable.block,
    field: 'docId',
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'refDocId',
          match: docId1,
        },
        // Ignore if it is a link to the current document.
        {
          type: SearchQueryType.boolean,
          occur: SearchQueryOccur.must_not,
          queries: [
            {
              type: SearchQueryType.match,
              field: 'docId',
              match: docId1,
            },
          ],
        },
      ],
    },
    options: {
      pagination: {
        limit: 100,
      },
      hits: {
        fields: [
          'docId',
          'blockId',
          'parentBlockId',
          'parentFlavour',
          'additional',
          'markdownPreview',
        ],
        pagination: {
          limit: 5,
        },
      },
    },
  });

  t.is(result.total, 3);
  t.is(result.buckets.length, 2);

  t.is(result.buckets[0].key, docId2);
  t.is(result.buckets[0].count, 2);
  t.deepEqual(
    pick(result.buckets[0].hits.nodes[0].fields, 'docId', 'blockId'),
    {
      docId: [docId2],
      blockId: [blockId3],
    }
  );
  t.deepEqual(
    pick(result.buckets[0].hits.nodes[1].fields, 'docId', 'blockId'),
    {
      docId: [docId2],
      blockId: [blockId4],
    }
  );

  t.is(result.buckets[1].key, docId3);
  t.is(result.buckets[1].count, 1);
  t.deepEqual(
    pick(result.buckets[1].hits.nodes[0].fields, 'docId', 'blockId'),
    {
      docId: [docId3],
      blockId: [blockId5],
    }
  );

  t.snapshot(
    result.buckets.map(bucket => ({
      count: bucket.count,
      hits: bucket.hits.nodes.map(node => ({
        fields: omit(node.fields, 'docId', 'blockId'),
      })),
    }))
  );
});

test('should throw error when field is not allowed in aggregate input', async t => {
  await t.throwsAsync(
    indexerService.aggregate({
      table: SearchTable.block,
      field: 'workspaceId',
      query: {
        type: SearchQueryType.all,
      },
      options: {
        hits: {
          fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
        },
      },
    }),
    {
      message:
        'Invalid indexer input: aggregate field "workspaceId" is not allowed',
    }
  );
});

// #endregion

// #region deleteWorkspace()

test('should delete workspace work', async t => {
  const workspaceId = randomUUID();
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  await indexerService.write(
    SearchTable.doc,
    [
      {
        workspaceId,
        docId: docId1,
        title: 'hello world',
        summary: 'this is a test',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId,
        docId: docId2,
        title: 'hello world',
        summary: 'this is a test',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId,
        docId: docId1,
        blockId: randomUUID(),
        content: 'hello world',
        flavour: 'affine:text',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  let result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspaceId,
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });

  t.is(result.total, 2);
  t.is(result.nodes.length, 2);

  let result2 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspaceId,
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
    },
  });

  t.is(result2.total, 1);
  t.is(result2.nodes.length, 1);

  await indexerService.deleteWorkspace(workspaceId, {
    refresh: true,
  });

  result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspaceId,
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });
  t.is(result.total, 0);
  t.is(result.nodes.length, 0);

  result2 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.match,
      field: 'workspaceId',
      match: workspaceId,
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
    },
  });

  t.is(result2.total, 0);
  t.is(result2.nodes.length, 0);
});

// #endregion

// #region deleteDoc()

test('should delete doc work', async t => {
  const workspaceId = randomUUID();
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  await indexerService.write(
    SearchTable.doc,
    [
      {
        workspaceId,
        docId: docId1,
        title: 'hello world',
        summary: 'this is a test',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId,
        docId: docId2,
        title: 'hello world',
        summary: 'this is a test',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId,
        docId: docId1,
        blockId: randomUUID(),
        content: 'hello world',
        flavour: 'affine:text',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId,
        docId: docId2,
        blockId: randomUUID(),
        content: 'hello world',
        flavour: 'affine:text',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  let result1 = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });

  t.is(result1.total, 1);
  t.is(result1.nodes.length, 1);
  t.deepEqual(result1.nodes[0].fields.docId, [docId1]);

  let result2 = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });

  t.is(result2.total, 1);
  t.is(result2.nodes.length, 1);
  t.deepEqual(result2.nodes[0].fields.docId, [docId2]);

  let result3 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
    },
  });
  t.is(result3.total, 1);
  t.is(result3.nodes.length, 1);
  t.deepEqual(result3.nodes[0].fields.docId, [docId1]);

  let result4 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
    },
  });
  t.is(result4.total, 1);
  t.is(result4.nodes.length, 1);
  t.deepEqual(result4.nodes[0].fields.docId, [docId2]);

  const count = module.queue.count('copilot.embedding.deleteDoc');

  await indexerService.deleteDoc(workspaceId, docId1, {
    refresh: true,
  });
  t.is(module.queue.count('copilot.embedding.deleteDoc'), count + 1);

  // make sure the docId1 is deleted
  result1 = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });

  t.is(result1.total, 0);
  t.is(result1.nodes.length, 0);

  // make sure the docId2 is not deleted
  result2 = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });

  t.is(result2.total, 1);
  t.is(result2.nodes.length, 1);
  t.deepEqual(result2.nodes[0].fields.docId, [docId2]);

  // make sure the docId1 block is deleted
  result3 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId1,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
    },
  });

  t.is(result3.total, 0);
  t.is(result3.nodes.length, 0);

  // docId2 block should not be deleted
  result4 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        {
          type: SearchQueryType.match,
          field: 'docId',
          match: docId2,
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
    },
  });

  t.is(result4.total, 1);
  t.is(result4.nodes.length, 1);
  t.deepEqual(result4.nodes[0].fields.docId, [docId2]);
});

// #endregion

// #region listDocIds()

test('should list doc ids work', async t => {
  const workspaceId = randomUUID();
  const docs = [];
  const docCount = 20011;
  for (let i = 0; i < docCount; i++) {
    docs.push({
      workspaceId,
      docId: randomUUID(),
      title: `hello world ${i} ${randomUUID()}`,
      summary: `this is a test ${i} ${randomUUID()}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await indexerService.write(SearchTable.doc, docs, {
    refresh: true,
  });

  const docIds = await indexerService.listDocIds(workspaceId);

  t.is(docIds.length, docCount);
  t.deepEqual(docIds.sort(), docs.map(doc => doc.docId).sort());

  await indexerService.deleteWorkspace(workspaceId, {
    refresh: true,
  });
  const docIds2 = await indexerService.listDocIds(workspaceId);

  t.is(docIds2.length, 0);
});

// #endregion

// #region indexDoc()

test('should index doc work', async t => {
  const count = module.queue.count('copilot.embedding.updateDoc');
  const docSnapshot = await module.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user,
  });

  await indexerService.indexDoc(workspace.id, docSnapshot.id, {
    refresh: true,
  });

  const result = await indexerService.search({
    table: SearchTable.doc,
    query: {
      type: SearchQueryType.match,
      field: 'docId',
      match: docSnapshot.id,
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
    },
  });

  t.is(result.total, 1);
  t.deepEqual(result.nodes[0].fields.workspaceId, [workspace.id]);
  t.deepEqual(result.nodes[0].fields.docId, [docSnapshot.id]);
  t.snapshot(omit(result.nodes[0].fields, ['workspaceId', 'docId']));

  // search blocks
  const result2 = await indexerService.search({
    table: SearchTable.block,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries: [
        {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        {
          type: SearchQueryType.match,
          field: 'content',
          match:
            'For developers or installations guides, please go to AFFiNE Doc',
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'blockId', 'content', 'flavour'],
      highlights: [
        {
          field: 'content',
          before: '<b>',
          end: '</b>',
        },
      ],
      pagination: {
        limit: 2,
      },
    },
  });

  t.is(result2.nodes.length, 2);
  t.snapshot(
    result2.nodes.map(node => omit(node.fields, ['workspaceId', 'docId']))
  );
  t.is(module.queue.count('copilot.embedding.updateDoc'), count + 1);
});
// #endregion

// #region searchBlobNames()

test('should search blob names from doc snapshot work', async t => {
  const docSnapshot = await module.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user,
    snapshotFile: 'test-doc-with-blob.snapshot.bin',
  });

  await indexerService.indexDoc(workspace.id, docSnapshot.id, {
    refresh: true,
  });

  const blobNameMap = await indexerService.searchBlobNames(workspace.id, [
    'ldZMrM4PDlsNG4Q4YvCsz623h6TKu4qI9_FpTqIypfw=',
  ]);

  t.snapshot(blobNameMap);
});

test('should search blob names work', async t => {
  const workspaceId = randomUUID();
  const blobId1 = 'blob1';
  const blobId2 = 'blob2';
  const blobId3 = 'blob3';
  const blobId4 = 'blob4';

  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId,
        blob: blobId1,
        content: 'blob1 name.txt',
        flavour: 'affine:attachment',
        docId: randomUUID(),
        blockId: randomUUID(),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId,
        blob: blobId2,
        content: 'blob2 name.md',
        flavour: 'affine:attachment',
        docId: randomUUID(),
        blockId: randomUUID(),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workspaceId,
        blob: blobId3,
        content: 'blob3 name.docx',
        flavour: 'affine:attachment',
        docId: randomUUID(),
        blockId: randomUUID(),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // no attachment
      {
        workspaceId,
        blob: blobId3,
        content: 'mock blob3 content',
        flavour: 'affine:page',
        docId: randomUUID(),
        blockId: randomUUID(),
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  const blobNameMap = await indexerService.searchBlobNames(workspaceId, [
    blobId1,
    blobId2,
    blobId3,
    blobId4,
  ]);

  t.is(blobNameMap.size, 3);
  t.snapshot(
    Array.from(blobNameMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  );
});

// #endregion

// #region searchDocsByKeyword()

test('should search docs by keyword work', async t => {
  const workspaceId = workspace.id;
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  const docId4 = randomUUID();

  await module.create(Mockers.DocMeta, {
    workspaceId,
    docId: docId1,
    title: 'hello world 1',
  });
  await module.create(Mockers.DocMeta, {
    workspaceId,
    docId: docId2,
    title: 'hello world 2',
  });
  await module.create(Mockers.DocMeta, {
    workspaceId,
    docId: docId3,
    title: 'hello world 3',
  });

  await indexerService.write(
    SearchTable.block,
    [
      {
        workspaceId,
        docId: docId1,
        blockId: 'block1',
        content: 'hello world',
        flavour: 'affine:page',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-06-20T00:00:00.000Z'),
        updatedAt: new Date('2025-06-20T00:00:00.000Z'),
      },
      {
        workspaceId,
        docId: docId2,
        blockId: 'block2',
        content: 'hello world 2',
        flavour: 'affine:text',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-06-20T00:00:01.000Z'),
        updatedAt: new Date('2025-06-20T00:00:01.000Z'),
      },
      {
        workspaceId,
        docId: docId3,
        blockId: 'block3',
        content: 'hello world 3',
        flavour: 'affine:text',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-06-20T00:00:02.000Z'),
        updatedAt: new Date('2025-06-20T00:00:02.000Z'),
      },
      {
        workspaceId,
        docId: docId4,
        blockId: 'block4',
        content: 'hello world 4',
        flavour: 'affine:text',
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: new Date('2025-06-20T00:00:03.000Z'),
        updatedAt: new Date('2025-06-20T00:00:03.000Z'),
      },
    ],
    {
      refresh: true,
    }
  );

  const rows = await indexerService.searchDocsByKeyword(workspaceId, 'hello');

  t.is(rows.length, 4);
  t.snapshot(
    rows
      .map(row =>
        omit(row, [
          'docId',
          'createdByUserId',
          'updatedByUserId',
          'createdByUser',
          'updatedByUser',
        ])
      )
      .sort((a, b) => a.blockId.localeCompare(b.blockId))
  );
});

// #endregion
