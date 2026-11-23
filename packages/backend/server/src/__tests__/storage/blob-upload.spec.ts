import test from 'ava';
import Sinon from 'sinon';

import { BlobQuotaExceeded } from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { PermissionAccess, PermissionService } from '../../core/permission';
import { WorkspaceBlobStorage } from '../../core/storage';
import { BlobUploadCleanupJob } from '../../core/storage/job';
import { WorkspaceBlobResolver } from '../../core/workspaces/resolvers/blob';
import { Models } from '../../models';
import { BlobModel } from '../../models/blob';
test('cleanup job drains Rust reservation batches', async t => {
  const cleanupExpiredStorageReservationsV1 = Sinon.stub();
  cleanupExpiredStorageReservationsV1.onCall(0).resolves(1000);
  cleanupExpiredStorageReservationsV1.onCall(1).resolves(1000);
  cleanupExpiredStorageReservationsV1.onCall(2).resolves(2);
  const job = new BlobUploadCleanupJob({
    cleanupExpiredStorageReservationsV1,
  } as never);

  await job.cleanExpiredPendingBlobs();

  t.is(cleanupExpiredStorageReservationsV1.callCount, 3);
  t.true(cleanupExpiredStorageReservationsV1.alwaysCalledWithExactly(1000));
});

for (const uploadId of ['old-upload', 'current-upload']) {
  test(`multipart abort fences ${uploadId}`, async t => {
    const permission = Sinon.createStubInstance(PermissionService);
    const runtime = Sinon.createStubInstance(BackendRuntimeProvider);
    const storage = Sinon.createStubInstance(WorkspaceBlobStorage);
    const models = new Models();
    const blob = Sinon.createStubInstance(BlobModel);
    models.blob = blob;
    blob.get.resolves({
      workspaceId: 'workspace',
      key: 'key',
      size: 4,
      mime: 'text/plain',
      status: 'pending',
      reservationId: 'new-reservation',
      uploadId: 'current-upload',
      createdAt: new Date(),
      deletedAt: null,
      reservationExpiresAt: new Date(),
    });
    storage.abortMultipartUpload.resolves(true);
    runtime.abortStorageReservationV1.resolves(true);
    const resolver = new WorkspaceBlobResolver(
      new PermissionAccess(permission),
      runtime,
      storage,
      models
    );
    const result = await resolver.abortBlobUpload(
      {
        id: 'user',
        email: 'user@example.com',
        name: 'User',
        avatarUrl: null,
        disabled: false,
        hasPassword: true,
        emailVerified: true,
      },
      'workspace',
      'key',
      uploadId
    );
    const current = uploadId === 'current-upload';
    t.is(result, current);
    t.is(storage.abortMultipartUpload.callCount, current ? 1 : 0);
    t.is(runtime.abortStorageReservationV1.callCount, current ? 1 : 0);
    if (current) {
      t.deepEqual(runtime.abortStorageReservationV1.firstCall.args, [
        {
          workspaceId: 'workspace',
          userId: 'user',
          key: 'key',
          reservationId: 'new-reservation',
          kind: 'blob',
        },
      ]);
    }
  });
}

for (const failure of ['quota', 'runtime']) {
  test(`blob reservation logs ${failure} failure with upload context`, async t => {
    const permission = Sinon.createStubInstance(PermissionService);
    const runtime = Sinon.createStubInstance(BackendRuntimeProvider);
    const storage = Sinon.createStubInstance(WorkspaceBlobStorage);
    const resolver = new WorkspaceBlobResolver(
      new PermissionAccess(permission),
      runtime,
      storage,
      new Models()
    );
    const error = new Error('storage key is deleted');
    if (failure === 'quota') {
      runtime.reserveStorageQuotaV1.resolves({
        allowed: false,
        reason: 'blob_limit',
        limit: 10,
        requested: 20,
        alreadyUploaded: false,
      });
    } else {
      runtime.reserveStorageQuotaV1.rejects(error);
    }
    const log = Sinon.stub(
      resolver.logger,
      failure === 'quota' ? 'warn' : 'error'
    );
    try {
      const caught = await t.throwsAsync(
        resolver.createBlobUpload(
          {
            id: 'user',
            email: 'user@example.com',
            name: 'User',
            avatarUrl: null,
            disabled: false,
            hasPassword: true,
            emailVerified: true,
          },
          'workspace',
          'key',
          20,
          'audio/aac'
        )
      );
      if (failure === 'quota') t.true(caught instanceof BlobQuotaExceeded);
      else t.is(caught, error);
      t.true(log.calledOnce);
      t.like(log.firstCall.args[0], {
        workspaceId: 'workspace',
        key: 'key',
        size: 20,
        mime: 'audio/aac',
        userId: 'user',
      });
    } finally {
      log.restore();
    }
  });
}
