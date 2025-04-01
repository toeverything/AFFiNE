import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import test from 'ava';

import { createModule } from '../../../../__tests__/create-module';
import { Mockers } from '../../../../__tests__/mocks';
import { IndexerModule } from '../../';
import { SearchProviderName } from '../../config';
import { ManticoresearchProvider } from '../../providers';
import { SearchTable } from '../../tables';

const module = await createModule({
  imports: [IndexerModule],
  providers: [ManticoresearchProvider],
});
const searchProvider = module.get(ManticoresearchProvider);
const user = await module.create(Mockers.User);

test.before(async () => {
  const tablesDir = path.join(import.meta.dirname, '../../tables');
  await searchProvider.createTable(
    SearchTable.block,
    path.join(tablesDir, 'block.sql')
  );
  await searchProvider.createTable(
    SearchTable.doc,
    path.join(tablesDir, 'doc.sql')
  );

  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: randomUUID(),
        doc_id: randomUUID(),
        block_id: randomUUID(),
        content: `hello world on search title, ${randomUUID()}`,
        flavour: 'affine:page',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        workspace_id: randomUUID(),
        doc_id: randomUUID(),
        block_id: randomUUID(),
        content: `hello world on search block content, ${randomUUID()}`,
        flavour: 'other:flavour',
        blob: randomUUID(),
        ref_doc_id: randomUUID(),
        ref: ['{"foo": "bar"}', '{"foo": "baz"}'],
        parent_flavour: 'parent:flavour',
        parent_block_id: randomUUID(),
        additional: '{"foo": "bar"}',
        markdown_preview: 'markdownPreview',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        workspace_id: 'workspaceId101',
        doc_id: 'docId101',
        block_id: 'blockId101',
        content: 'hello world on search block content at 101',
        flavour: 'other:flavour',
        blob: 'blob101',
        ref_doc_id: 'docId101',
        ref: ['{"foo": "bar"}', '{"foo": "baz"}'],
        parent_flavour: 'parent:flavour',
        parent_block_id: 'blockId101',
        additional: '{"foo": "bar"}',
        markdown_preview: 'markdownPreview',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date('2025-04-19T08:19:36.160Z'),
        updated_at: new Date('2025-04-19T08:19:36.160Z'),
      },
      {
        workspace_id: 'workspaceId1',
        doc_id: 'docId2',
        block_id: 'blockId8',
        content:
          'title8 hello hello hello hello hello hello hello hello hello hello, hello hello hello hello hello hello hello hello some link https://linear.app/affine-design/issue/AF-1379/slash-commands-%E6%BF%80%E6%B4%BB%E6%8F%92%E5%85%A5-link-%E7%9A%84%E5%BC%B9%E7%AA%97%E9%87%8C%EF%BC%8C%E8%BE%93%E5%85%A5%E9%93%BE%E6%8E%A5%E4%B9%8B%E5%90%8E%E4%B8%8D%E5%BA%94%E8%AF%A5%E7%9B%B4%E6%8E%A5%E5%AF%B9%E9%93%BE%E6%8E%A5%E8%BF%9B%E8%A1%8C%E5%88%86%E8%AF%8D%E6%90%9C%E7%B4%A2',
        flavour: 'flavour8',
        ref_doc_id: 'docId1',
        ref: [
          '{"docId":"docId1","mode":"page"}',
          '{"docId":"docId2","mode":"page"}',
        ],
        parent_flavour: 'parentFlavour8',
        parent_block_id: 'parentBlockId8',
        additional: 'additional8',
        markdown_preview: 'markdownPreview8',
        created_by_user_id: 'userId8',
        updated_by_user_id: 'userId8',
        created_at: new Date('2025-03-08T06:04:13.278Z'),
        updated_at: new Date('2025-03-08T06:04:13.278Z'),
      },
    ],
    {
      refresh: true,
    }
  );
  const blocks = await readFile(
    path.join(import.meta.dirname, '../test-blocks.json'),
    'utf-8'
  );
  // @ts-expect-error access protected method
  await searchProvider.requestBulk(
    SearchTable.block,
    blocks.trim().split('\n'),
    {
      // make sure the data is visible to search
      refresh: 'true',
    }
  );
  const docs = await readFile(
    path.join(import.meta.dirname, '../test-docs.json'),
    'utf-8'
  );
  // @ts-expect-error access protected method
  await searchProvider.requestBulk(SearchTable.doc, docs.trim().split('\n'), {
    refresh: 'true',
  });
});

test.after.always(async () => {
  await module.close();
});

test('should provider is manticoresearch', t => {
  t.is(searchProvider.provider, SearchProviderName.Manticoresearch);
});

test('should search query match url work', async t => {
  const result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    query: {
      match: {
        content: 'https://linear.app/affine-design/issue/AF-1379/',
      },
    },
    fields: [
      'doc_id',
      'content',
      'ref',
      'ref_doc_id',
      'parent_flavour',
      'parent_block_id',
      'additional',
      'markdown_preview',
      'created_at',
      'updated_at',
    ],
    highlight: {
      fields: {
        content: {
          pre_tags: ['<b>'],
          post_tags: ['</b>'],
        },
      },
    },
    sort: ['_score'],
  });
  t.true(result.total >= 1);
  t.deepEqual(result.nodes[0].fields.doc_id, ['docId2']);
  t.deepEqual(result.nodes[0].fields.ref, [
    '{"docId":"docId1","mode":"page"}',
    '{"docId":"docId2","mode":"page"}',
  ]);
  t.deepEqual(result.nodes[0].fields.ref_doc_id, ['docId1']);
  t.deepEqual(result.nodes[0].fields.parent_flavour, ['parentFlavour8']);
  t.deepEqual(result.nodes[0].fields.parent_block_id, ['parentBlockId8']);
  t.deepEqual(result.nodes[0].fields.additional, ['additional8']);
  t.deepEqual(result.nodes[0].fields.markdown_preview, ['markdownPreview8']);
  t.regex(
    result.nodes[0].highlights?.content?.join('') as string,
    /<b>https:\/\/linear\.app\/affine-design\/issue\/AF-1379<\/b>/
  );
  t.deepEqual(result.nodes[0]._source, {
    doc_id: 'docId2',
    workspace_id: 'workspaceId1',
  });
});

test('should write document work', async t => {
  const workspaceId = randomUUID();
  const docId = randomUUID();
  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: workspaceId,
        doc_id: docId,
        content: 'hello world',
        flavour: 'affine:page',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  let result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    query: { match: { doc_id: docId } },
    fields: ['flavour', 'block_id', 'content', 'ref_doc_id'],
    sort: ['_score'],
  });
  t.is(result.nodes.length, 1);
  t.deepEqual(result.nodes[0].fields, {
    flavour: ['affine:page'],
    content: ['hello world'],
  });
  t.deepEqual(result.nodes[0]._source, {
    doc_id: docId,
    workspace_id: workspaceId,
  });
  // set ref_doc_id to a string
  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: workspaceId,
        doc_id: docId,
        content: 'hello world',
        flavour: 'affine:page',
        ref_doc_id: 'docId2',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    query: { match: { doc_id: docId } },
    fields: ['flavour', 'block_id', 'content', 'ref_doc_id'],
    sort: ['_score'],
  });
  t.is(result.nodes.length, 1);
  t.deepEqual(result.nodes[0].fields, {
    flavour: ['affine:page'],
    content: ['hello world'],
    ref_doc_id: ['docId2'],
  });
  // not set ref_doc_id and replace the old value to null
  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: workspaceId,
        doc_id: docId,
        content: 'hello world',
        flavour: 'affine:page',
        // ref_doc_id: 'docId2',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    query: { match: { doc_id: docId } },
    fields: ['flavour', 'block_id', 'content', 'ref_doc_id'],
    sort: ['_score'],
  });
  t.is(result.nodes.length, 1);
  t.deepEqual(result.nodes[0].fields, {
    flavour: ['affine:page'],
    content: ['hello world'],
  });
});

test('should handle ref_doc_id as string[]', async t => {
  const workspaceId = randomUUID();
  const docId = randomUUID();
  // set ref_doc_id to a string
  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: workspaceId,
        doc_id: docId,
        content: 'hello world',
        flavour: 'affine:page',
        ref_doc_id: 'docId2',
        ref: '{"foo": "bar"}',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  let result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id', 'ref_doc_id', 'ref'],
    query: { match: { doc_id: docId } },
    fields: ['flavour', 'content', 'ref_doc_id', 'ref'],
    sort: ['_score'],
  });
  t.is(result.nodes.length, 1);
  t.deepEqual(result.nodes[0].fields, {
    flavour: ['affine:page'],
    content: ['hello world'],
    ref_doc_id: ['docId2'],
    ref: ['{"foo": "bar"}'],
  });
  t.deepEqual(result.nodes[0]._source, {
    doc_id: docId,
    workspace_id: workspaceId,
    ref_doc_id: 'docId2',
    ref: '{"foo": "bar"}',
  });

  // set ref_doc_id to a string[]
  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: workspaceId,
        doc_id: docId,
        content: 'hello world',
        flavour: 'affine:page',
        ref_doc_id: ['docId2', 'docId3'],
        ref: ['{"foo": "bar"}', '{"foo": "baz"}'],
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id', 'ref_doc_id', 'ref'],
    query: { match: { doc_id: docId } },
    fields: ['flavour', 'content', 'ref_doc_id', 'ref'],
    sort: ['_score'],
  });
  t.is(result.nodes.length, 1);
  t.deepEqual(result.nodes[0].fields, {
    flavour: ['affine:page'],
    content: ['hello world'],
    ref_doc_id: ['docId2', 'docId3'],
    ref: ['{"foo": "bar"}', '{"foo": "baz"}'],
  });
  t.deepEqual(result.nodes[0]._source, {
    doc_id: docId,
    workspace_id: workspaceId,
    ref_doc_id: '["docId2","docId3"]',
    ref: '["{\\"foo\\": \\"bar\\"}","{\\"foo\\": \\"baz\\"}"]',
  });
});

test('should search query all and get next cursor work', async t => {
  const result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      {
        created_at: 'desc',
      },
    ],
    query: {
      match_all: {},
    },
    fields: [
      'flavour',
      'workspace_id',
      'doc_id',
      'content',
      'created_at',
      'updated_at',
    ],
    size: 2,
  });
  t.truthy(result.total);
  t.is(result.timedOut, false);
  t.truthy(result.nextCursor);
  t.is(typeof result.nextCursor, 'string');
  t.is(result.nodes.length, 2);
  t.truthy(result.nodes[0]._id);
  t.truthy(result.nodes[0]._score);
  t.truthy(result.nodes[0].fields.flavour);
  t.truthy(result.nodes[0].fields.doc_id);
  t.truthy(result.nodes[0].fields.content);
  t.truthy(result.nodes[0].fields.created_at);
  t.truthy(result.nodes[0].fields.updated_at);
  t.deepEqual(Object.keys(result.nodes[0]._source), ['workspace_id', 'doc_id']);

  // test cursor
  const result2 = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      {
        created_at: 'desc',
      },
    ],
    query: {
      match_all: {},
    },
    fields: ['flavour', 'doc_id', 'content', 'created_at', 'updated_at'],
    size: 10000,
    cursor: result.nextCursor,
  });
  t.is(result2.total, result.total - result.nodes.length);
  t.is(result2.timedOut, false);
  t.truthy(result2.nextCursor);
  t.is(typeof result2.nextCursor, 'string');
  t.true(result2.nodes.length < 10000);

  // next cursor should be empty
  const result3 = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    sort: [
      '_score',
      {
        updated_at: 'desc',
      },
      {
        created_at: 'desc',
      },
    ],
    query: {
      match_all: {},
    },
    fields: ['flavour', 'doc_id', 'content', 'created_at', 'updated_at'],
    size: 10000,
    cursor: result2.nextCursor,
  });
  t.is(result3.total, 0);
  t.is(result3.timedOut, false);
  t.falsy(result3.nextCursor);
  t.is(result3.nodes.length, 0);
});

test('should aggregate query work', async t => {
  const result = await searchProvider.aggregate(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    sort: ['_score', { updated_at: 'desc' }, { created_at: 'desc' }],
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
            bool: {
              must: [
                {
                  match: {
                    content: 'hello',
                  },
                },
                {
                  bool: {
                    should: [
                      {
                        match: {
                          content: 'hello',
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
        ],
      },
    },
    aggs: {
      result: {
        terms: { field: 'doc_id' },
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
              fields: ['block_id', 'flavour'],
              size: 2,
            },
          },
        },
      },
    },
  });
  // console.log(JSON.stringify(result, null, 2));
  t.truthy(result.total);
  t.is(result.timedOut, false);
  t.truthy(result.nextCursor);
  t.is(typeof result.nextCursor, 'string');
  t.true(result.buckets.length > 0);
  t.truthy(result.buckets[0].key);
  t.true(result.buckets[0].count > 0);
  t.truthy(result.buckets[0].hits.nodes.length > 0);
  t.truthy(result.buckets[0].hits.nodes[0]._id);
  t.truthy(result.buckets[0].hits.nodes[0]._score);
  t.truthy(result.buckets[0].hits.nodes[0].fields.block_id);
  // top1 result should be "affine:page" flavour
  t.deepEqual(result.buckets[0].hits.nodes[0].fields.flavour, ['affine:page']);
  t.truthy(result.buckets[0].hits.nodes[0].highlights?.content);
  t.deepEqual(Object.keys(result.buckets[0].hits.nodes[0]._source), [
    'workspace_id',
    'doc_id',
  ]);
});

test('should delete by query work', async t => {
  const workspaceId = randomUUID();
  const docId = randomUUID();
  await searchProvider.write(
    SearchTable.block,
    [
      {
        workspace_id: workspaceId,
        doc_id: docId,
        content: `hello world on search title, ${randomUUID()}`,
        flavour: 'affine:page',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        workspace_id: workspaceId,
        doc_id: docId,
        block_id: randomUUID(),
        content: `hello world on search title, ${randomUUID()}`,
        flavour: 'other:flavour',
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );
  const result = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    query: {
      bool: {
        must: [
          {
            match: {
              workspace_id: workspaceId,
            },
          },
          {
            match: {
              doc_id: docId,
            },
          },
        ],
      },
    },
    fields: ['block_id'],
    sort: ['_score'],
  });
  t.is(result.nodes.length, 2);
  await searchProvider.deleteByQuery(
    SearchTable.block,
    {
      bool: {
        must: [
          {
            match: {
              workspace_id: workspaceId,
            },
          },
          {
            match: {
              doc_id: docId,
            },
          },
        ],
      },
    },
    {
      refresh: true,
    }
  );

  const result2 = await searchProvider.search(SearchTable.block, {
    _source: ['workspace_id', 'doc_id'],
    query: {
      bool: {
        must: [
          {
            match: {
              workspace_id: workspaceId,
            },
          },
          {
            match: {
              doc_id: docId,
            },
          },
        ],
      },
    },
    fields: ['block_id'],
    sort: ['_score'],
  });
  t.is(result2.nodes.length, 0);
});
