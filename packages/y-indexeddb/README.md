# @toeverything/y-indexeddb

## Usage

```ts
import { createIndexedDBProvider, downloadBinary } from '@toeverything/y-indexeddb';
import * as Y from 'yjs';
const yDoc = new Y.Doc();

// sync yDoc with indexedDB
const provider = createIndexedDBProvider('docName', yDoc);
provider.connect();
await provider.whenSynced.then(() => {
  console.log('synced');
  provider.disconnect();
});

// dowload binary data from indexedDB for once
downloadBinary('docName').then(blob => {
  if (blob !== false) {
    Y.applyUpdate(yDoc, blob);
  }
});
```
