import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { encoding } from 'lib0';
import * as Y from 'yjs';

import { Storage } from '../index.js';

// update binary by y.doc.text('content').insert('hello world')
// prettier-ignore
let init = Buffer.from([1,1,160,238,169,240,10,0,4,1,7,99,111,110,116,101,110,116,11,104,101,108,108,111,32,119,111,114,108,100,0])
describe('Test jwst storage binding', () => {
  /** @type { Storage } */
  let storage;
  beforeEach(async () => {
    storage = await Storage.connect('sqlite::memory:', true);
  });

  test('should be able to create workspace', async () => {
    const workspace = await storage.createWorkspace('test-workspace', init);

    assert(workspace.id === 'test-workspace');
    assert.deepEqual(init, await storage.load(workspace.doc.guid));
  });

  test('should not create workspace with same id', async () => {
    await storage.createWorkspace('test-workspace', init);
    await assert.rejects(
      storage.createWorkspace('test-workspace', init),
      /Workspace [\w-]+ already exists/
    );
  });

  test('should be able to delete workspace', async () => {
    const workspace = await storage.createWorkspace('test-workspace', init);

    await storage.deleteWorkspace(workspace.id);

    await assert.rejects(
      storage.load(workspace.doc.guid),
      /Doc [\w-]+ not exists/
    );
  });

  test('should be able to sync update', async () => {
    const workspace = await storage.createWorkspace('test-workspace', init);

    const update = await storage.load(workspace.doc.guid);
    assert(update !== null);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);

    let text = doc.getText('content');
    assert.equal(text.toJSON(), 'hello world');

    const updates = [];
    doc.on('update', async (/** @type { UInt8Array } */ update) => {
      updates.push(Buffer.from(update));
    });

    text.insert(5, ' my');
    text.insert(14, '!');

    for (const update of updates) {
      await storage.sync(workspace.id, workspace.doc.guid, update);
    }

    const update2 = await storage.load(workspace.doc.guid);
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, update2);

    text = doc2.getText('content');
    assert.equal(text.toJSON(), 'hello my world!');
  });

  test('should be able to sync update with guid encoded', async () => {
    const workspace = await storage.createWorkspace('test-workspace', init);

    const update = await storage.load(workspace.doc.guid);
    assert(update !== null);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);

    let text = doc.getText('content');
    assert.equal(text.toJSON(), 'hello world');

    const updates = [];
    doc.on('update', async (/** @type { UInt8Array } */ update) => {
      const prefix = encoding.encode(encoder => {
        encoding.writeVarString(encoder, workspace.doc.guid);
      });

      updates.push(Buffer.concat([prefix, update]));
    });

    text.insert(5, ' my');
    text.insert(14, '!');

    for (const update of updates) {
      await storage.syncWithGuid(workspace.id, update);
    }

    const update2 = await storage.load(workspace.doc.guid);
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, update2);

    text = doc2.getText('content');
    assert.equal(text.toJSON(), 'hello my world!');
  });

  test('should be able to store blob', async () => {
    let workspace = await storage.createWorkspace('test-workspace', init);
    const blobId = await storage.uploadBlob(workspace.id, Buffer.from([1]));

    assert(blobId !== null);

    let blob = await storage.blob(workspace.id, blobId);

    assert.deepEqual(blob.data, Buffer.from([1]));
    assert.strictEqual(blob.size, 1);
    assert.equal(blob.contentType, 'application/octet-stream');

    await storage.uploadBlob(workspace.id, Buffer.from([1, 2, 3, 4, 5]));

    const spaceTaken = await storage.blobsSize(workspace.id);

    assert.equal(spaceTaken, 6);
  });
});
