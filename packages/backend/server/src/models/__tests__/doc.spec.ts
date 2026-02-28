import { randomUUID } from 'node:crypto';

import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '..';

const module = await createModule({});

const models = module.get(Models);
const owner = await module.create(Mockers.User);

test.after.always(async () => {
  await module.close();
});

test('should find null summary doc ids', async t => {
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });

  const docId = randomUUID();
  await module.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId,
  });

  const docIds = await models.doc.findEmptySummaryDocIds(workspace.id);
  t.deepEqual(docIds, [docId]);
});

test('should ignore summary is not null', async t => {
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });

  const docId = randomUUID();
  await module.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId,
    summary: 'test',
  });

  const docIds = await models.doc.findEmptySummaryDocIds(workspace.id);
  t.is(docIds.length, 0);
});
