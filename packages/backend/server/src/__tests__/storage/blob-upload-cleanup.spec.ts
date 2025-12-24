import { ScheduleModule } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { OneDay } from '../../base';
import { StorageModule, WorkspaceBlobStorage } from '../../core/storage';
import { BlobUploadCleanupJob } from '../../core/storage/job';
import { MockUser, MockWorkspace } from '../mocks';
import { createTestingModule, TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  job: BlobUploadCleanupJob;
  storage: WorkspaceBlobStorage;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  t.context.module = await createTestingModule({
    imports: [ScheduleModule.forRoot(), StorageModule],
  });

  t.context.db = t.context.module.get(PrismaClient);
  t.context.job = t.context.module.get(BlobUploadCleanupJob);
  t.context.storage = t.context.module.get(WorkspaceBlobStorage);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('should cleanup expired pending blobs', async t => {
  const user = await t.context.module.create(MockUser);
  const workspace = await t.context.module.create(MockWorkspace, {
    owner: { id: user.id },
  });

  const expiredAt = new Date(Date.now() - OneDay - 1000);
  const activeAt = new Date();

  await t.context.db.blob.createMany({
    data: [
      {
        workspaceId: workspace.id,
        key: 'expired-pending',
        size: 4,
        mime: 'text/plain',
        status: 'pending',
        uploadId: null,
        createdAt: expiredAt,
      },
      {
        workspaceId: workspace.id,
        key: 'expired-multipart',
        size: 4,
        mime: 'text/plain',
        status: 'pending',
        uploadId: 'upload-1',
        createdAt: expiredAt,
      },
      {
        workspaceId: workspace.id,
        key: 'pending-active',
        size: 4,
        mime: 'text/plain',
        status: 'pending',
        uploadId: null,
        createdAt: activeAt,
      },
      {
        workspaceId: workspace.id,
        key: 'completed-keep',
        size: 4,
        mime: 'text/plain',
        status: 'completed',
        uploadId: null,
        createdAt: expiredAt,
      },
    ],
  });

  const abortSpy = Sinon.spy(t.context.storage, 'abortMultipartUpload');
  const deleteSpy = Sinon.spy(t.context.storage, 'delete');
  t.teardown(() => {
    abortSpy.restore();
    deleteSpy.restore();
  });

  await t.context.job.cleanExpiredPendingBlobs();

  t.is(abortSpy.callCount, 1);
  t.is(deleteSpy.callCount, 2);

  const remaining = await t.context.db.blob.findMany({
    where: { workspaceId: workspace.id },
  });
  const remainingKeys = remaining.map(record => record.key).sort();
  t.deepEqual(remainingKeys, ['completed-keep', 'pending-active']);
});
