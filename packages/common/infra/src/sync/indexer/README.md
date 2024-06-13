# index

Search engine abstraction layer for AFFiNE.

## Using

1. Define schema

First, we need to define the shape of the data. Currently, there are the following data types.

- 'Integer'
- 'Boolean'
- 'FullText': for full-text search, it will be tokenized and stemmed.
- 'String': for exact match search, e.g. tags, ids.

```typescript
const schema = defineSchema({
  title: 'FullText',
  tag: 'String',
  size: 'Integer',
});
```

> **Array type**
> All types can contain one or more values, so each field can store an array.

2. Pick a backend

Currently, there are two backends available.

- `MemoryIndex`: in-memory indexer, useful for testing.
- `IndexedDBIndex`: persistent indexer using IndexedDB.

> **Underlying Data Table**
> Some back-end processes need to maintain underlying data tables, including table creation and migration. This operation should be silently executed the first time the indexer is invoked.
> Callers do not need to worry about these details.
>
> This design conforms to the usual conventions of search engine APIs, such as in Elasticsearch: https://www.elastic.co/guide/en/elasticsearch/reference/current/array.html

3. Write data

Write data to the indexer. you need to start a write transaction by `await index.write()` first and then complete the batch write through `await writer.commit()`.

> **Transactional**
> Typically, the indexer does not provide transactional guarantees; reliable locking logic needs to be implemented at a higher level.

```typescript
const indexer = new IndexedDBIndex(schema);

const writer = await index.write();
writer.insert(
  Document.from('id', {
    title: 'hello world',
    tag: ['doc', 'page'],
    size: '100',
  })
);
await writer.commit();
```

4. Search data

To search for content in the indexer, you need to use a specific **query language**. Here are some examples:

```typescript
// match title == 'hello world'
{
  type: 'match',
  field: 'title',
  match: 'hello world',
}

// match title == 'hello world' && tag == 'doc'
{
    type: 'boolean',
    occur: 'must',
    queries: [
        {
            type: 'match',
            field: 'title',
            match: 'hello world',
        },
        {
            type: 'match',
            field: 'tag',
            match: 'doc',
        },
    ],
}
```

There are two ways to perform the search, `index.search()` and `index.aggregate()`.

- **search**: return each matched node and pagination information.
- **aggregate**: aggregate all matched results based on a certain field into buckets, and return the count and score of items in each bucket.

Examples:

```typescript
const result = await index.search({
  type: 'match',
  field: 'title',
  match: 'hello world',
});
// result = {
//   nodes: [
//     {
//       id: '1',
//       score: 1,
//     },
//   ],
//   pagination: {
//     count: 1,
//     hasMore: false,
//     limit: 10,
//     skip: 0,
//   },
// }
```

```typescript
const result = await index.aggregate(
  {
    type: 'match',
    field: 'title',
    match: 'affine',
  },
  'tag'
);
// result = {
//   buckets: [
//     { key: 'motorcycle', count: 2, score: 1 },
//     { key: 'bike', count: 1, score: 1 },
//     { key: 'airplane', count: 1, score: 1 },
//   ],
//   pagination: {
//     count: 3,
//     hasMore: false,
//     limit: 10,
//     skip: 0,
//   },
// }
```

More uses:

[black-box.spec.ts](./__tests__/black-box.spec.ts)
