# @toeverything/y-indexeddb

> This package haven't been published yet.

## Usage

```ts
import { createIndexedDBProvider } from '@toeverything/y-indexeddb';
import * as Y from 'yjs';
const yDoc = new Y.Doc();

const provider = createIndexedDBProvider('docName', yDoc);
provider.connect();
await provider.whenSynced.then(() => {
  console.log('synced');
  provider.disconnect();
});
```
