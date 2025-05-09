import { randomUUID } from 'node:crypto';

import ava, { TestFn } from 'ava';

import { Config } from '../../base/config';
import { type User, UserModel } from '../../models/user';
import { UserDocModel } from '../../models/user-doc';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  config: Config;
  module: TestingModule;
  user: UserModel;
  doc: UserDocModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();

  t.context.user = module.get(UserModel);
  t.context.doc = module.get(UserDocModel);
  t.context.config = module.get(Config);
  t.context.module = module;
});

let user: User;

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.user.create({
    email: 'test@affine.pro',
  });
});

test.after(async t => {
  await t.context.module.close();
});

test('should upsert a doc', async t => {
  const docId = randomUUID();
  const doc = await t.context.doc.upsert({
    spaceId: user.id,
    docId,
    blob: Buffer.from('hello'),
    timestamp: Date.now(),
    editorId: user.id,
  });
  t.truthy(doc.updatedAt);
  // add a new one
  const docId2 = randomUUID();
  const doc2 = await t.context.doc.upsert({
    spaceId: user.id,
    docId: docId2,
    blob: Buffer.from('world'),
    timestamp: Date.now(),
    editorId: user.id,
  });
  t.truthy(doc2.updatedAt);
  // update the first one
  const doc3 = await t.context.doc.upsert({
    spaceId: user.id,
    docId,
    blob: Buffer.from('world'),
    timestamp: Date.now() + 1000,
    editorId: user.id,
  });
  t.truthy(doc3.updatedAt);
  t.true(doc3.updatedAt > doc.updatedAt);
  // get all docs timestamps
  const timestamps = await t.context.doc.findTimestampsByUserId(user.id);
  t.deepEqual(timestamps, {
    [docId]: doc3.updatedAt.getTime(),
    [docId2]: doc2.updatedAt.getTime(),
  });
});

test('should get a doc', async t => {
  const docId = randomUUID();
  const doc = await t.context.doc.upsert({
    spaceId: user.id,
    docId,
    blob: Uint8Array.from([1, 2, 3]),
    timestamp: Date.now(),
    editorId: user.id,
  });
  t.truthy(doc.updatedAt);
  const doc2 = await t.context.doc.get(user.id, docId);
  t.truthy(doc2);
  t.is(doc2!.docId, docId);
  t.deepEqual(doc2!.blob, Uint8Array.from([1, 2, 3]));
  // get a non-exist doc
  const doc3 = await t.context.doc.get(user.id, randomUUID());
  t.is(doc3, null);
});
