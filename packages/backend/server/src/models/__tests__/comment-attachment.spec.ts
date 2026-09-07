import { Prisma, PrismaClient } from '@prisma/client';
import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '../index';

const module = await createModule();
const models = module.get(Models);
const db = module.get(PrismaClient);
const seedAttachment = (data: Prisma.CommentAttachmentUncheckedCreateInput) =>
  db.commentAttachment.upsert({
    where: {
      workspaceId_docId_key: {
        workspaceId: data.workspaceId,
        docId: data.docId,
        key: data.key,
      },
    },
    update: data,
    create: data,
  });

test.after.always(async () => {
  await module.close();
});

test('comment attachment projections include only live completed rows', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const live = await seedAttachment({
    workspaceId: workspace.id,
    docId: 'doc',
    name: 'live',
    key: 'live',
    mime: 'text/plain',
    size: 100,
    status: 'completed',
  });
  await seedAttachment({
    workspaceId: workspace.id,
    docId: 'doc',
    name: 'pending',
    key: 'pending',
    mime: 'text/plain',
    size: 200,
    status: 'pending',
  });
  await seedAttachment({
    workspaceId: workspace.id,
    docId: 'doc',
    name: 'deleted',
    key: 'deleted',
    mime: 'text/plain',
    size: 300,
    status: 'completed',
    deletedAt: new Date(),
  });

  t.deepEqual(
    (await models.commentAttachment.list(workspace.id, 'doc')).map(
      item => item.key
    ),
    [live.key]
  );
  t.is(
    (await models.commentAttachment.get(workspace.id, 'doc', live.key))?.key,
    live.key
  );
  for (const key of ['pending', 'deleted']) {
    t.is(await models.commentAttachment.get(workspace.id, 'doc', key), null);
  }
});
