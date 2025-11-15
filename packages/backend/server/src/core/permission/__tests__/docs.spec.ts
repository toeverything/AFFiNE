import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { DocRole, PermissionModule, WorkspaceRole } from '..';
import { AccessControllerBuilder } from '../builder';

const module = await createModule({
  imports: [PermissionModule],
});

const builder = module.get(AccessControllerBuilder);

test.after.always(async () => {
  await module.close();
});

test('should filter docs by Doc.Read', async t => {
  const owner = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });

  const docs1 = await builder
    .user(owner.id)
    .workspace(workspace.id)
    .docs(
      [{ docId: 'doc1' }, { docId: 'doc2' }, { docId: 'doc3' }],
      'Doc.Read'
    );

  t.is(docs1.length, 3);
  t.snapshot(docs1);

  // member should have access to the docs
  const member = await module.create(Mockers.User);
  await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
    type: WorkspaceRole.Collaborator,
  });

  await module.create(Mockers.DocUser, {
    workspaceId: workspace.id,
    docId: 'doc1',
    userId: member.id,
    type: DocRole.Reader,
  });

  await module.create(Mockers.DocUser, {
    workspaceId: workspace.id,
    docId: 'doc2',
    userId: member.id,
    type: DocRole.Manager,
  });

  const docs2 = await builder
    .user(member.id)
    .workspace(workspace.id)
    .docs(
      [{ docId: 'doc1' }, { docId: 'doc2' }, { docId: 'doc3' }],
      'Doc.Read'
    );

  t.is(docs2.length, 3);
  t.snapshot(docs2);

  // other user should not have access to the docs
  const other = await module.create(Mockers.User);

  const docs3 = await builder
    .user(other.id)
    .workspace(workspace.id)
    .docs(
      [{ docId: 'doc1' }, { docId: 'doc2' }, { docId: 'doc3' }],
      'Doc.Read'
    );

  t.is(docs3.length, 0);
});

test('should filter docs by Doc.Publish', async t => {
  const owner = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });

  const docs1 = await builder
    .user(owner.id)
    .workspace(workspace.id)
    .docs(
      [{ docId: 'doc1' }, { docId: 'doc2' }, { docId: 'doc3' }],
      'Doc.Publish'
    );

  t.is(docs1.length, 3);
  t.snapshot(docs1);

  // member should have access to the docs
  const member = await module.create(Mockers.User);
  await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
    type: WorkspaceRole.Collaborator,
  });

  await module.create(Mockers.DocUser, {
    workspaceId: workspace.id,
    docId: 'doc1',
    userId: member.id,
    type: DocRole.Reader,
  });

  await module.create(Mockers.DocUser, {
    workspaceId: workspace.id,
    docId: 'doc2',
    userId: member.id,
    type: DocRole.Manager,
  });

  const docs2 = await builder
    .user(member.id)
    .workspace(workspace.id)
    .docs(
      [{ docId: 'doc1' }, { docId: 'doc2' }, { docId: 'doc3' }],
      'Doc.Publish'
    );

  t.is(docs2.length, 2);
  t.snapshot(docs2);

  // other user should not have access to the docs
  const other = await module.create(Mockers.User);

  const docs3 = await builder
    .user(other.id)
    .workspace(workspace.id)
    .docs(
      [{ docId: 'doc1' }, { docId: 'doc2' }, { docId: 'doc3' }],
      'Doc.Publish'
    );

  t.is(docs3.length, 0);
});
