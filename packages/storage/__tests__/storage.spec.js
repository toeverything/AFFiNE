import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { Storage } from '../index.js';

// update binary by y.doc.text('content').insert('hello world')
// prettier-ignore
let init = Buffer.from([1,1,219,172,147,230,2,0,4,1,7,99,111,110,116,101,110,116,11,104,101,108,108,111,32,119,111,114,108,100,0])
describe('Test jwst storage binding', () => {
  /** @type { Storage } */
  let storage;
  beforeEach(async () => {
    storage = await Storage.connect('sqlite::memory:', true);
  });

  test('should be able to store blob', async () => {
    let workspace = await storage.createWorkspace('test-workspace');
    await storage.sync(workspace.id, workspace.doc.guid, init);
    const blobId = await storage.uploadBlob(workspace.id, Buffer.from([1]));

    assert(blobId !== null);

    let list = await storage.listBlobs(workspace.id);
    assert.deepEqual(list, [blobId]);

    let blob = await storage.getBlob(workspace.id, blobId);
    assert.deepEqual(blob.data, Buffer.from([1]));
    assert.strictEqual(blob.size, 1);
    assert.equal(blob.contentType, 'application/octet-stream');

    await storage.uploadBlob(workspace.id, Buffer.from([1, 2, 3, 4, 5]));

    const spaceTaken = await storage.blobsSize(workspace.id);

    assert.equal(spaceTaken, 6);
  });
});
