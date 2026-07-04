import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Models } from '../../../models';
import { AccessControllerBuilder } from '../builder';
import { PermissionDiagnosticService } from '../diagnostic';
import { DocRole, PermissionModule, WorkspaceRole } from '../index';
import { PermissionSqlPredicateBuilder } from '../sql-predicate';
import type { DocAction } from '../types';

const module = await createModule({
  imports: [PermissionModule],
});

const builder = module.get(AccessControllerBuilder);
const models = module.get(Models);
const db = module.get(PrismaClient);
const diagnostic = module.get(PermissionDiagnosticService);
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
  const predicate = sqlPredicate.docReadableByNewTablesSql({
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
  await models.workspaceRuntimeState.upsert(workspaceId, {
    readonly: false,
    readonlyReasons: [],
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

test('SQL doc read predicate matches Rust for projection default and public candidates', async t => {
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
  const shadow = await diagnostic.shadowSqlDocRead({
    workspaceId: workspace.id,
    userId: member.id,
    docs: docIds.map(docId => ({ docId })),
    sqlReadableDocIds: sqlReadable,
  });

  t.deepEqual(sqlReadable, ['missing-policy', 'public-doc']);
  t.true(shadow.matched);
});

test('SQL doc read predicate matches Rust for non-member grant and sharing disabled', async t => {
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
  const sharingEnabledShadow = await diagnostic.shadowSqlDocRead({
    workspaceId: workspace.id,
    userId: nonMember.id,
    docs: docIds.map(docId => ({ docId })),
    sqlReadableDocIds: sharingEnabledReadable,
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
  const sharingDisabledShadow = await diagnostic.shadowSqlDocRead({
    workspaceId: workspace.id,
    userId: nonMember.id,
    docs: docIds.map(docId => ({ docId })),
    sqlReadableDocIds: sharingDisabledReadable,
  });

  t.deepEqual(sharingEnabledReadable, [
    'public-doc',
    'explicit-grant',
    'explicit-owner-grant',
  ]);
  t.true(sharingEnabledShadow.matched);
  t.deepEqual(sharingEnabledUpdate, ['explicit-owner-grant']);
  t.deepEqual(sharingDisabledReadable, []);
  t.true(sharingDisabledShadow.matched);
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

test('legacy SQL doc predicate matches external row and explicit grant cap semantics', async t => {
  const workspaceId = randomUUID();
  const memberId = randomUUID();
  const externalId = randomUUID();

  async function fixtureLegacyDocIds(input: {
    userId: string;
    action: DocAction;
    docIds: string[];
  }) {
    const values = Prisma.join(
      input.docIds.map((docId, index) => Prisma.sql`(${docId}, ${index})`)
    );
    const predicate = sqlPredicate.docReadableByLegacyTablesSql({
      workspaceId,
      userId: input.userId,
      action: input.action,
      docIdColumn: Prisma.raw('c.doc_id'),
    });
    // Current triggers reject newly inserted legacy External workspace rows;
    // CTEs let the same predicate run in Postgres against historical shapes.
    const rows = await db.$queryRaw<{ docId: string }[]>`
      WITH
        workspaces(id, enable_sharing) AS (
          VALUES (${workspaceId}, true)
        ),
        workspace_pages(workspace_id, page_id, public, "defaultRole") AS (
          VALUES
            (${workspaceId}, 'default-manager', false, ${DocRole.Manager}::smallint),
            (${workspaceId}, 'explicit-reader', false, ${DocRole.Manager}::smallint),
            (${workspaceId}, 'external-owner', false, ${DocRole.Manager}::smallint),
            (${workspaceId}, 'dirty-external', false, ${DocRole.Manager}::smallint)
        ),
        workspace_user_permissions(
          id,
          workspace_id,
          user_id,
          status,
          type
        ) AS (
          VALUES
            (${randomUUID()}, ${workspaceId}, ${memberId}, 'Accepted'::"WorkspaceMemberStatus", ${WorkspaceRole.Collaborator}::smallint),
            (${randomUUID()}, ${workspaceId}, ${externalId}, 'Accepted'::"WorkspaceMemberStatus", ${WorkspaceRole.External}::smallint)
        ),
        workspace_page_user_permissions(
          workspace_id,
          page_id,
          user_id,
          type
        ) AS (
          VALUES
            (${workspaceId}, 'explicit-reader', ${memberId}, ${DocRole.Reader}::smallint),
            (${workspaceId}, 'external-owner', ${externalId}, ${DocRole.Owner}::smallint),
            (${workspaceId}, 'dirty-external', ${externalId}, ${DocRole.External}::smallint)
        ),
        candidates(doc_id, ord) AS (VALUES ${values})
      SELECT c.doc_id AS "docId"
      FROM candidates c
      WHERE ${predicate}
      ORDER BY c.ord ASC
    `;
    return rows.map(row => row.docId);
  }

  const memberUpdateAllowed = await fixtureLegacyDocIds({
    userId: memberId,
    action: 'Doc.Update',
    docIds: ['default-manager', 'explicit-reader'],
  });
  const externalUpdateAllowed = await fixtureLegacyDocIds({
    userId: externalId,
    action: 'Doc.Update',
    docIds: ['external-owner', 'dirty-external'],
  });
  const externalManageAllowed = await fixtureLegacyDocIds({
    userId: externalId,
    action: 'Doc.Users.Manage',
    docIds: ['external-owner', 'dirty-external'],
  });
  const externalTransferAllowed = await fixtureLegacyDocIds({
    userId: externalId,
    action: 'Doc.TransferOwner',
    docIds: ['external-owner', 'dirty-external'],
  });

  t.deepEqual(memberUpdateAllowed, ['default-manager']);
  t.deepEqual(externalUpdateAllowed, ['external-owner']);
  t.deepEqual(externalManageAllowed, []);
  t.deepEqual(externalTransferAllowed, []);
});

test('should filter docs by Doc.Publish', async t => {
  const owner = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });
  await models.workspace.update(workspace.id, { enableSharing: true });
  await models.workspaceRuntimeState.upsert(workspace.id, {
    readonly: false,
    readonlyReasons: [],
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

test('legacy duplicate doc owner grants do not block projection', async t => {
  const owner = await module.create(Mockers.User);
  const secondOwner = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner,
  });
  const docId = randomUUID();

  await db.$executeRaw`
    INSERT INTO workspace_pages (
      workspace_id,
      page_id,
      public,
      "defaultRole"
    )
    VALUES (${workspace.id}, ${docId}, false, ${DocRole.Manager})
  `;
  await resetProjection(workspace.id);

  await db.$transaction(async tx => {
    await tx.$executeRaw`
      SELECT set_config('affine.permission_projection.enabled', 'off', true)
    `;
    await tx.$executeRaw`
      INSERT INTO workspace_page_user_permissions (
        workspace_id,
        page_id,
        user_id,
        type,
        created_at
      )
      VALUES (
        ${workspace.id},
        ${docId},
        ${owner.id},
        ${DocRole.Owner},
        ${new Date('2026-01-02T00:00:00Z')}
      )
    `;
    await tx.$executeRaw`
      INSERT INTO workspace_page_user_permissions (
        workspace_id,
        page_id,
        user_id,
        type,
        created_at
      )
      VALUES (
        ${workspace.id},
        ${docId},
        ${secondOwner.id},
        ${DocRole.Owner},
        ${new Date('2026-01-01T00:00:00Z')}
      )
    `;
  });

  await models.permissionProjection.backfillLegacyProjection();

  const projectedOwners = await db.$queryRaw<{ principalId: string }[]>`
    SELECT principal_id AS "principalId"
    FROM doc_grants
    WHERE workspace_id = ${workspace.id}
      AND doc_id = ${docId}
      AND role = 'owner'
  `;

  t.deepEqual(projectedOwners, [{ principalId: secondOwner.id }]);
});
