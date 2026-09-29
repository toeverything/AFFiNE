import test from 'ava';
import Sinon from 'sinon';

import { BlobUploadCleanupJob } from '../../core/storage/job';
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
