import { randomUUID } from 'node:crypto';

import ava, { TestFn } from 'ava';
import { applyUpdate, Doc as YDoc } from 'yjs';

import {
  DocStorageModule,
  PgUserspaceDocStorageAdapter as Adapter,
} from '../../core/doc';
import { Models, type User } from '../../models';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  models: Models;
  adapter: Adapter;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({
    imports: [DocStorageModule],
  });

  t.context.models = module.get(Models);
  t.context.adapter = module.get(Adapter);
  t.context.module = module;
});

let user: User;

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.models.user.create({
    email: 'test@affine.pro',
  });
});

test.after(async t => {
  await t.context.module.close();
});

test('should push user doc updates work', async t => {
  const docId = randomUUID();
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Uint8Array[] = [];

  doc.on('update', update => {
    updates.push(update);
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  let timestamp = await t.context.adapter.pushDocUpdates(
    user.id,
    docId,
    updates
  );
  t.truthy(timestamp);

  let record = await t.context.adapter.getDoc(user.id, docId);
  const newDoc = new YDoc();
  applyUpdate(newDoc, record!.bin);

  t.is(newDoc.getText('content').toString(), 'hello world');
  // find all timestamps
  const timestamps = await t.context.adapter.getSpaceDocTimestamps(user.id);
  t.deepEqual(timestamps, {
    [docId]: timestamp,
  });
});

test('should delete user doc work', async t => {
  const docId = randomUUID();
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Uint8Array[] = [];

  doc.on('update', update => {
    updates.push(update);
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  let timestamp = await t.context.adapter.pushDocUpdates(
    user.id,
    docId,
    updates
  );
  t.truthy(timestamp);

  let record = await t.context.adapter.getDoc(user.id, docId);
  t.truthy(record);

  await t.context.adapter.deleteDoc(user.id, docId);

  record = await t.context.adapter.getDoc(user.id, docId);
  t.falsy(record);
});

test('should delete all user docs work', async t => {
  const docId = randomUUID();
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Uint8Array[] = [];

  doc.on('update', update => {
    updates.push(update);
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  let timestamp = await t.context.adapter.pushDocUpdates(
    user.id,
    docId,
    updates
  );
  t.truthy(timestamp);

  let record = await t.context.adapter.getDoc(user.id, docId);
  t.truthy(record);

  await t.context.adapter.deleteSpace(user.id);

  record = await t.context.adapter.getDoc(user.id, docId);
  t.falsy(record);
});
