# @toeverything/y-indexeddb

## Features

- persistence data in indexeddb
- sub-documents support
- fully TypeScript

## Usage

```ts
import { createIndexedDBProvider, downloadBinary } from '@toeverything/y-indexeddb';
import * as Y from 'yjs';

const yDoc = new Y.Doc({
  // we use `guid` as unique key
  guid: 'my-doc',
});

// sync yDoc with indexedDB
const provider = createIndexedDBProvider(yDoc);
provider.connect();
await provider.whenSynced.then(() => {
  console.log('synced');
  provider.disconnect();
});

// dowload binary data from indexedDB for once
downloadBinary(yDoc.guid).then(blob => {
  if (blob !== false) {
    Y.applyUpdate(yDoc, blob);
  }
});
```

## LICENSE

[MPL-2.0](https://github.com/toeverything/AFFiNE/blob/master/LICENSE-MPL2.0)
