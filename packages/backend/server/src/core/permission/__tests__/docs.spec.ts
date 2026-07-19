import { Prisma, PrismaClient } from '@prisma/client';
import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Models } from '../../../models';
import { AccessControllerBuilder } from '../builder';
import { DocRole, PermissionModule, WorkspaceRole } from '../index';
import { PermissionSqlPredicateBuilder } from '../sql-predicate';
import type { DocAction } from '../types';

const module = await createModule({
  imports: [PermissionModule],
});

const builder = module.get(AccessControllerBuilder);
const models = module.get(Models);
const db = module.get(PrismaClient);
const sqlPredicate = module.get(PermissionSqlPredicateBuilder);

test.after.always(async () => {
  await module.close();
});

async function sqlReadableDocIds(input: {
  workspaceId: string;
  userId?: string;
  action?: DocAction;
  docIds: string[];
}) {
  const values = Prisma.join(
    input.docIds.map((docId, index) => Prisma.sql`(${docId}, ${index})`)
  );
  const predicate = sqlPredicate.docReadableSql({
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: input.action ?? 'Doc.Read',
    docIdColumn: Prisma.raw('c.doc_id'),
  });
  const rows = await db.$queryRaw<{ docId: string }[]>`
    WITH candidates(doc_id, ord) AS (VALUES ${values})
    SELECT c.doc_id AS "docId"
    FROM candidates c
    WHERE ${predicate}
    ORDER BY c.ord ASC
  `;
  return rows.map(row => row.docId);
}

async function resetProjection(workspaceId: string) {
  await db.$executeRaw`DELETE FROM doc_grants WHERE workspace_id = ${workspaceId}`;
  await db.$executeRaw`DELETE FROM doc_access_policies WHERE workspace_id = ${workspaceId}`;
  await db.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}`;
  await db.$executeRaw`
    INSERT INTO workspace_access_policies (
      workspace_id,
      visibility,
      sharing_enabled,
      url_preview_enabled,
      member_default_doc_role,
      updated_at
    )
    VALUES (${workspaceId}, 'private', true, false, 'none', now())
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      visibility = EXCLUDED.visibility,
      sharing_enabled = EXCLUDED.sharing_enabled,
      url_preview_enabled = EXCLUDED.url_preview_enabled,
      member_default_doc_role = EXCLUDED.member_default_doc_role,
      updated_at = now()
  `;
  await setWritableRuntime(workspaceId);
}

async function setWritableRuntime(workspaceId: string) {
  await db.effectiveWorkspaceQuotaState.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      plan: 'free',
      usesOwnerQuota: false,
      seatLimit: 0,
      blobLimit: 0,
      storageQuota: 0,
      historyPeriodSeconds: 0,
      readonly: false,
      known: true,
    },
    update: {
      readonly: false,
      readonlyReasons: [],
      known: true,
      stale: false,
    },
  });
}

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

test('SQL doc read predicate handles member default and public candidates', async t => {
  const owner = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });
  await resetProjection(workspace.id);
  await db.$executeRaw`
    UPDATE workspace_access_policies
    SET member_default_doc_role = 'reader'
    WHERE workspace_id = ${workspace.id}
  `;
  await db.$executeRaw`
    INSERT INTO workspace_members (
      workspace_id,
      user_id,
      role,
      state,
      source,
      updated_at
    )
    VALUES (${workspace.id}, ${member.id}, 'member', 'active', 'legacy', now())
  `;
  await db.$executeRaw`
    INSERT INTO doc_access_policies (
      workspace_id,
      doc_id,
      visibility,
      public_role,
      member_default_role,
      updated_at
    )
    VALUES
      (${workspace.id}, 'member-default-none', 'private', NULL, 'none', now()),
      (${workspace.id}, 'public-doc', 'public', 'external', NULL, now())
  `;

  const docIds = ['missing-policy', 'member-default-none', 'public-doc'];
  const sqlReadable = await sqlReadableDocIds({
    workspaceId: workspace.id,
    userId: member.id,
    docIds,
  });
  t.deepEqual(sqlReadable, ['missing-policy', 'public-doc']);
});

test('SQL doc read predicate handles non-member grant and sharing disabled', async t => {
  const owner = await module.create(Mockers.User);
  const nonMember = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });
  await resetProjection(workspace.id);
  await db.$executeRaw`
    INSERT INTO doc_access_policies (
      workspace_id,
      doc_id,
      visibility,
      public_role,
      member_default_role,
      updated_at
    )
    VALUES
      (${workspace.id}, 'public-doc', 'public', 'external', NULL, now()),
      (${workspace.id}, 'private-doc', 'private', NULL, NULL, now()),
      (${workspace.id}, 'explicit-grant', 'private', NULL, NULL, now()),
      (${workspace.id}, 'explicit-owner-grant', 'private', NULL, NULL, now())
  `;
  await db.$executeRaw`
    INSERT INTO doc_grants (
      workspace_id,
      doc_id,
      principal_type,
      principal_id,
      role,
      updated_at
    )
    VALUES
      (
        ${workspace.id},
        'explicit-grant',
        'user',
        ${nonMember.id},
        'reader',
        now()
      ),
      (
        ${workspace.id},
        'explicit-owner-grant',
        'user',
        ${nonMember.id},
        'owner',
        now()
      )
  `;

  const docIds = [
    'public-doc',
    'private-doc',
    'explicit-grant',
    'explicit-owner-grant',
  ];
  const sharingEnabledReadable = await sqlReadableDocIds({
    workspaceId: workspace.id,
    userId: nonMember.id,
    docIds,
  });
  const sharingEnabledUpdate = await sqlReadableDocIds({
    workspaceId: workspace.id,
    userId: nonMember.id,
    action: 'Doc.Update',
    docIds,
  });

  await db.$executeRaw`
    UPDATE workspace_access_policies
    SET sharing_enabled = false
    WHERE workspace_id = ${workspace.id}
  `;
  const sharingDisabledReadable = await sqlReadableDocIds({
    workspaceId: workspace.id,
    userId: nonMember.id,
    docIds,
  });

  t.deepEqual(sharingEnabledReadable, [
    'public-doc',
    'explicit-grant',
    'explicit-owner-grant',
  ]);
  t.deepEqual(sharingEnabledUpdate, ['explicit-owner-grant']);
  t.deepEqual(sharingDisabledReadable, []);
});

test('SQL doc predicate suppresses member default when explicit grant exists', async t => {
  const owner = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });
  await resetProjection(workspace.id);
  await db.$executeRaw`
    UPDATE workspace_access_policies
    SET member_default_doc_role = 'manager'
    WHERE workspace_id = ${workspace.id}
  `;
  await db.$executeRaw`
    INSERT INTO workspace_members (
      workspace_id,
      user_id,
      role,
      state,
      source,
      updated_at
    )
    VALUES (${workspace.id}, ${member.id}, 'member', 'active', 'legacy', now())
  `;
  await db.$executeRaw`
    INSERT INTO doc_access_policies (
      workspace_id,
      doc_id,
      visibility,
      public_role,
      member_default_role,
      updated_at
    )
    VALUES
      (${workspace.id}, 'default-manager', 'private', NULL, NULL, now()),
      (${workspace.id}, 'explicit-reader', 'private', NULL, NULL, now())
  `;
  await db.$executeRaw`
    INSERT INTO doc_grants (
      workspace_id,
      doc_id,
      principal_type,
      principal_id,
      role,
      updated_at
    )
    VALUES (
      ${workspace.id},
      'explicit-reader',
      'user',
      ${member.id},
      'reader',
      now()
    )
  `;

  const docIds = ['default-manager', 'explicit-reader'];
  const sqlUpdateAllowed = await sqlReadableDocIds({
    workspaceId: workspace.id,
    userId: member.id,
    action: 'Doc.Update',
    docIds,
  });

  t.deepEqual(sqlUpdateAllowed, ['default-manager']);
});

test('should filter docs by Doc.Publish', async t => {
  const owner = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });
  await models.workspace.update(workspace.id, { enableSharing: true });
  await setWritableRuntime(workspace.id);

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
