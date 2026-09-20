# `@blocksuite/store`

This package is the data layer for modeling collaborative document states. It's natively built on the CRDT library [Yjs](https://github.com/yjs/yjs), powering all BlockSuite documents with built-in real-time collaboration and time-travel capabilities.

## `Doc`

In BlockSuite, a [`Doc`](/api/@blocksuite/store/classes/Doc.html) is the container for a block tree, providing essential functionalities for creating, retrieving, updating, and deleting blocks inside it. Under the hood, every doc holds a Yjs [subdocument](https://docs.yjs.dev/api/subdocuments).

Besides the block tree, the [selection](./selection) state is also stored in the [`doc.awarenessStore`](/api/@blocksuite/store/classes/Doc.html#awarenessstore) inside the doc. This store is also built on top of the Yjs [awareness](https://docs.yjs.dev/api/about-awareness).

## `DocCollection`

In BlockSuite, a [`DocCollection`](/api/@blocksuite/store/classes/DocCollection.html) is defined as an opt-in collection of multiple docs, providing comprehensive features for managing cross-doc updates and data synchronization. You can access the collection via the `doc.collection` getter, or you can also create a collection manually:

```ts
import { DocCollection, Schema } from '@blocksuite/store';

const schema = new Schema();

// You can register a batch of block schemas to the collection
schema.register(AffineSchemas);

const collection = new DocCollection({ schema });
collection.meta.initialize();
```

Then multiple `doc`s can be created under the collection:

```ts
const collection = new DocCollection({ schema });
collection.meta.initialize();

// This is an empty doc at this moment
const doc = collection.createDoc();
```

As an example, the `createEmptyDoc` is a simple helper implemented exactly in this way ([source](https://github.com/toeverything/blocksuite/blob/master/packages/presets/src/helpers/index.ts)):

```ts
import { AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, DocCollection } from '@blocksuite/store';

export function createEmptyDoc() {
  const schema = new Schema().register(AffineSchemas);
  const collection = new DocCollection({ schema });
  collection.meta.initialize();
  const doc = collection.createDoc();

  return {
    doc,
    async init() {
      await doc.load(() => {
        const rootBlockId = doc.addBlock('affine:page', {});
        doc.addBlock('affine:surface', {}, rootBlockId);
        const noteId = doc.addBlock('affine:note', {}, rootBlockId);
        doc.addBlock('affine:paragraph', {}, noteId);
      });
      return doc;
    },
  };
}
```
