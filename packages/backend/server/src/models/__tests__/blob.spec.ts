import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '../index';

const module = await createModule();
const models = module.get(Models);
const db = module.get(PrismaClient);
const seedBlob = (data: Prisma.BlobUncheckedCreateInput) =>
  db.blob.upsert({
    where: {
      workspaceId_key: { workspaceId: data.workspaceId, key: data.key },
    },
    update: data,
    create: data,
  });

test.after.always(async () => {
  await module.close();
});

test('blob projections include only live completed rows', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const live = await seedBlob({
    workspaceId: workspace.id,
    key: 'live',
    mime: 'text/plain',
    size: 100,
    status: 'completed',
  });
  await seedBlob({
    workspaceId: workspace.id,
    key: 'pending',
    mime: 'text/plain',
    size: 200,
    status: 'pending',
  });
  await seedBlob({
    workspaceId: workspace.id,
    key: 'deleted',
    mime: 'text/plain',
    size: 300,
    status: 'completed',
    deletedAt: new Date(),
  });

  const blobs = await models.blob.list(workspace.id);
  t.deepEqual(
    blobs.map(blob => blob.key),
    [live.key]
  );
  t.true(await models.blob.hasAny(workspace.id));
  t.is(await models.blob.totalSize(workspace.id), 100);
});

test('blob reservation upload id is fenced by pending reservation identity', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const reservationId = randomUUID();
  await seedBlob({
    workspaceId: workspace.id,
    key: 'pending',
    mime: 'text/plain',
    size: 100,
    status: 'pending',
    reservationId,
  });

  await models.blob.setReservationUploadId(
    workspace.id,
    'pending',
    reservationId,
    'upload'
  );
  t.is((await models.blob.get(workspace.id, 'pending'))?.uploadId, 'upload');

  await t.throwsAsync(
    models.blob.setReservationUploadId(
      workspace.id,
      'pending',
      randomUUID(),
      'stale-upload'
    ),
    { message: 'Blob reservation changed' }
  );
});

test('empty workspace blob projections are empty', async t => {
  const workspace = await module.create(Mockers.Workspace);
  await seedBlob({
    workspaceId: workspace.id,
    key: 'pending',
    mime: 'text/plain',
    size: 100,
    status: 'pending',
  });

  t.deepEqual(await models.blob.list(workspace.id), []);
  t.false(await models.blob.hasAny(workspace.id));
  t.is(await models.blob.totalSize(workspace.id), 0);
});
