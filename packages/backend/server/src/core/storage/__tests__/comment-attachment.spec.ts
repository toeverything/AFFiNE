import { Readable } from 'node:stream';

import test from 'ava';
import Sinon from 'sinon';

import { CommentAttachmentQuotaExceeded } from '../../../base';
import { CommentAttachmentStorage } from '../wrappers/comment-attachment';

const workspaceId = 'workspace';
const docId = 'doc';
const key = 'attachment';
const reservationId = '018fe090-7ca5-7b87-a53f-39f5c287bd23';
const body = Buffer.from('test');

function setup() {
  const rt = {
    putObject: Sinon.stub().resolves({
      contentType: 'text/plain',
      contentLength: body.length,
    }),
    deleteObject: Sinon.stub().resolves(),
    getObject: Sinon.stub().resolves({
      body: Readable.from(body),
      metadata: { contentType: 'text/plain', contentLength: body.length },
    }),
  };
  const runtime = {
    reserveStorageQuotaV1: Sinon.stub().resolves({
      allowed: true,
      alreadyUploaded: false,
      reservationId,
    }),
    finalizeStorageReservationV1: Sinon.stub().resolves(true),
    abortStorageReservationV1: Sinon.stub().resolves(true),
  };
  const models = {
    commentAttachment: {
      get: Sinon.stub().resolves({ key }),
    },
  };
  const storage = new CommentAttachmentStorage(
    { link: (path: string) => `https://app.affine.pro${path}` } as never,
    rt as never,
    runtime as never,
    models as never
  );
  return { storage, rt, runtime, models };
}

test('comment attachment upload delegates reservation semantics to Rust', async t => {
  const { storage, rt, runtime } = setup();

  await storage.put(workspaceId, docId, key, 'test.txt', body, 'user');

  t.deepEqual(runtime.reserveStorageQuotaV1.firstCall.args, [
    {
      workspaceId,
      userId: 'user',
      key,
      size: body.length,
      mime: 'text/plain',
      kind: 'comment_attachment',
      docId,
      name: 'test.txt',
    },
  ]);
  t.deepEqual(rt.putObject.firstCall.args, [
    'blob',
    `comment-attachments/${workspaceId}/${docId}/.reservations/${reservationId}/${key}`,
    body,
  ]);
  t.deepEqual(runtime.finalizeStorageReservationV1.firstCall.args, [
    {
      workspaceId,
      userId: 'user',
      docId,
      key,
      reservationId,
      kind: 'comment_attachment',
      mime: 'text/plain',
      size: body.length,
    },
  ]);
  t.false(rt.deleteObject.called);
});

test('comment attachment upload delegates fenced cleanup after failures', async t => {
  for (const { name, configure, message } of [
    {
      name: 'finalize lost reservation',
      configure: ({ runtime }: ReturnType<typeof setup>) =>
        runtime.finalizeStorageReservationV1.resolves(false),
      message: 'Comment attachment reservation changed',
    },
    {
      name: 'finalize failed',
      configure: ({ runtime }: ReturnType<typeof setup>) =>
        runtime.finalizeStorageReservationV1.rejects(
          new Error('finalize failed')
        ),
      message: 'finalize failed',
    },
    {
      name: 'upload failed after writing',
      configure: ({ rt, runtime }: ReturnType<typeof setup>) => {
        rt.putObject.rejects(new Error('upload failed'));
        runtime.abortStorageReservationV1.resolves(false);
      },
      message: 'upload failed',
    },
  ]) {
    const fixture = setup();
    configure(fixture);

    await t.throwsAsync(
      fixture.storage.put(workspaceId, docId, key, 'test.txt', body, 'user'),
      { message }
    );
    t.true(fixture.runtime.abortStorageReservationV1.calledOnce, name);
    t.false(fixture.rt.deleteObject.called, name);
  }
});

test('comment attachment upload handles denial and completed reservations', async t => {
  const denied = setup();
  denied.runtime.reserveStorageQuotaV1.resolves({ allowed: false });
  const error = await t.throwsAsync(
    denied.storage.put(workspaceId, docId, key, 'test.txt', body, 'user')
  );
  t.true(error instanceof CommentAttachmentQuotaExceeded);
  t.false(denied.rt.putObject.called);

  const completed = setup();
  completed.runtime.reserveStorageQuotaV1.resolves({
    allowed: true,
    alreadyUploaded: true,
  });
  await completed.storage.put(
    workspaceId,
    docId,
    key,
    'test.txt',
    body,
    'user'
  );
  t.false(completed.rt.putObject.called);
  t.false(completed.runtime.finalizeStorageReservationV1.called);
});

test('comment attachment reads require a live ledger projection', async t => {
  const { storage, rt, models } = setup();

  const result = await storage.get({ workspaceId, docId, key });
  t.truthy(result.body);
  t.deepEqual(result.metadata, {
    contentType: 'text/plain',
    contentLength: body.length,
  });
  models.commentAttachment.get.resolves(null);
  t.deepEqual(await storage.get({ workspaceId, docId, key }), {});
  t.is(rt.getObject.callCount, 1);
  t.is(
    storage.getUrl(workspaceId, docId, key),
    `https://app.affine.pro/api/workspaces/${workspaceId}/docs/${docId}/comment-attachments/${key}`
  );
});
