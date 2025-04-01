import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { ServerConfigModule } from '../../../core/config';
import { IndexerModule, IndexerService } from '..';
import { SearchProviderFactory } from '../factory';
import { ManticoresearchProvider } from '../providers';
import { SearchTable } from '../tables';
import {
  AggregateInput,
  SearchInput,
  SearchQueryOccur,
  SearchQueryType,
} from '../types';

const module = await createModule({
  imports: [IndexerModule, ServerConfigModule],
  providers: [IndexerService],
});
const indexerService = module.get(IndexerService);
const searchProviderFactory = module.get(SearchProviderFactory);
const manticoresearch = module.get(ManticoresearchProvider);
const user = await module.create(Mockers.User);

mock.method(searchProviderFactory, 'get', () => {
  return manticoresearch;
});

test.after.always(async () => {
  await module.close();
});

test.before(async () => {
  await indexerService.createTables();
});

// #region write()

test('should write throw error when field type wrong', async t => {
  await t.throwsAsync(
    indexerService.write(SearchTable.block, [
      {
        workspaceId: 'workspaceId1',
        docId: 'docId1',
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
      'block_id',
    ],
    query: {
      match_all: {},
    },
    fields: ['flavour', 'doc_id', 'ref_doc_id'],
  });
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
      'block_id',
    ],
    query: {
      exists: {
        field: 'ref_doc_id',
      },
    },
    fields: ['flavour', 'doc_id', 'ref_doc_id'],
  });
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
      'block_id',
    ],
    query: {
      match: {
        flavour: {
          query: 'affine:page',
          boost: 1.5,
        },
      },
    },
    fields: ['flavour', 'doc_id', 'ref_doc_id'],
  });
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
      'block_id',
    ],
    query: {
      match: {
        flavour: {
          query: 'affine:page',
        },
      },
    },
    fields: [
      'flavour',
      'doc_id',
      'ref_doc_id',
      'parent_flavour',
      'parent_block_id',
      'additional',
      'markdown_preview',
      'created_by_user_id',
      'updated_by_user_id',
      'created_at',
      'updated_at',
    ],
  });
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
      'block_id',
    ],
    query: {
      bool: {
        must: [
          {
            match: {
              workspace_id: {
                query: 'workspaceId1',
              },
            },
          },
          {
            match: {
              content: {
                query: 'hello',
              },
            },
          },
          {
            bool: {
              should: [
                {
                  match: {
                    content: {
                      query: 'hello',
                    },
                  },
                },
                {
                  match: {
                    flavour: {
                      query: 'affine:page',
                      boost: 1.5,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    fields: [
      'flavour',
      'doc_id',
      'ref_doc_id',
      'parent_flavour',
      'parent_block_id',
      'additional',
      'markdown_preview',
      'created_by_user_id',
      'updated_by_user_id',
      'created_at',
      'updated_at',
    ],
  });
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
      'block_id',
    ],
    query: {
      match_all: {},
    },
    highlight: {
      fields: {
        content: {
          pre_tags: ['<b>'],
          post_tags: ['</b>'],
        },
      },
    },
    fields: ['flavour', 'doc_id', 'ref_doc_id'],
  });
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
  t.deepEqual(result, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      'doc_id',
    ],
    query: {
      match_all: {},
    },
    aggs: {
      result: {
        terms: {
          field: 'flavour',
        },
        aggs: {
          result: {
            top_hits: {
              _source: ['workspace_id', 'doc_id'],
              highlight: {
                fields: {
                  content: {
                    pre_tags: ['<b>'],
                    post_tags: ['</b>'],
                  },
                },
              },
              fields: ['flavour', 'doc_id', 'ref_doc_id'],
            },
          },
        },
      },
    },
  });
});

// #endregion

// #region search()

test('should search work', async t => {
  const workspaceId = randomUUID();
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  await indexerService.write(SearchTable.doc, [
    {
      workspaceId,
      title: 'hello world',
      summary: 'this is a test',
      docId: docId1,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      workspaceId,
      title: '你好世界',
      summary: '这是测试',
      docId: docId2,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const result = await indexerService.search({
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
          field: 'title',
          match: 'hello 你好',
        },
      ],
    },
    options: {
      fields: ['workspaceId', 'docId', 'title', 'summary'],
      highlights: [{ field: 'title', before: '<b>', end: '</b>' }],
    },
  });
  // console.log(JSON.stringify(result, null, 2));
  t.truthy(result.nextCursor);
  t.is(result.total, 2);
  t.is(result.nodes.length, 2);
  t.deepEqual(result.nodes[0].fields, {
    workspaceId: [workspaceId],
    docId: [docId1],
    title: ['hello world'],
    summary: ['this is a test'],
  });
  t.deepEqual(result.nodes[0].highlights, {
    title: ['<b>hello</b> world'],
  });
  t.deepEqual(result.nodes[0]._source, {
    workspaceId,
    docId: docId1,
  });
  t.deepEqual(result.nodes[1].fields, {
    workspaceId: [workspaceId],
    docId: [docId2],
    title: ['你好世界'],
    summary: ['这是测试'],
  });
  t.deepEqual(result.nodes[1].highlights, {
    title: ['<b>你好</b> 世界'],
  });
  t.deepEqual(result.nodes[1]._source, {
    workspaceId,
    docId: docId2,
  });
});

// #endregion

// #region aggregate()

test('should aggregate work', async t => {
  const workspaceId = randomUUID();
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const blockId1 = randomUUID();
  const blockId2 = randomUUID();
  await indexerService.write(SearchTable.block, [
    {
      workspaceId,
      flavour: 'affine:page',
      docId: docId1,
      content: 'hello world, this is a title',
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      workspaceId,
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
      workspaceId,
      flavour: 'affine:text',
      docId: docId2,
      blockId: blockId2,
      content: 'hello world, this is a test block',
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
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
          match: workspaceId,
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
    workspaceId: [workspaceId],
    docId: [docId1],
    content: ['hello world, this is a title'],
    flavour: ['affine:page'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[0].highlights, {
    content: ['<b>hello</b> world, this is a title'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[0]._source, {
    workspaceId,
    docId: docId1,
  });
  t.deepEqual(result.buckets[0].hits.nodes[1].fields, {
    workspaceId: [workspaceId],
    docId: [docId1],
    blockId: [blockId1],
    content: ['hello world, this is a block'],
    flavour: ['affine:text'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[1].highlights, {
    content: ['<b>hello</b> world, this is a block'],
  });
  t.deepEqual(result.buckets[0].hits.nodes[1]._source, {
    workspaceId,
    docId: docId1,
  });
  t.deepEqual(result.buckets[1].key, docId2);
  t.is(result.buckets[1].count, 1);
  t.deepEqual(result.buckets[1].hits.nodes[0].fields, {
    workspaceId: [workspaceId],
    docId: [docId2],
    blockId: [blockId2],
    content: ['hello world, this is a test block'],
    flavour: ['affine:text'],
  });
  t.deepEqual(result.buckets[1].hits.nodes[0].highlights, {
    content: ['<b>hello</b> world, this is a test block'],
  });
  t.deepEqual(result.buckets[1].hits.nodes[0]._source, {
    workspaceId,
    docId: docId2,
  });
});

// #endregion
