import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { PermissionProjectionChecker } from '../../core/permission/projection-checker';
import {
  DocRole,
  PERMISSION_PROJECTION_TRIGGER_ERROR_CATEGORIES,
  PermissionProjectionModel,
  permissionProjectionTriggerErrorCategory,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../models';
import { createModule } from '../create-module';
import { Mockers } from '../mocks';

const module = await createModule({});
const db = module.get(PrismaClient);

test.after.always(async () => {
  await module.close();
});

class TestPermissionProjectionModel extends PermissionProjectionModel {
  constructor(private readonly fakeDb: unknown) {
    super();
  }

  protected override get db() {
    return this.fakeDb as never;
  }
}

let appliedPermissionProjectionTriggerFunctionUpdates = false;
async function applyPermissionProjectionTriggerFunctionUpdates() {
  if (appliedPermissionProjectionTriggerFunctionUpdates) {
    return;
  }
  const migration = readFileSync(
    join(
      process.cwd(),
      'migrations/20260512133700_workspace_runtime_states/migration.sql'
    ),
    'utf8'
  );
  for (const name of [
    'affine_permission_project_new_workspace_member',
    'affine_permission_project_new_workspace_invitation',
    'affine_permission_project_new_doc_access_policy',
    'affine_permission_project_new_doc_grant',
  ]) {
    const sql = migration.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION ${name}\\(\\)[\\s\\S]*?END\\n\\$\\$;`
      )
    )?.[0];
    if (!sql) {
      throw new Error(`Missing migration function ${name}`);
    }
    await db.$executeRawUnsafe(sql);
  }
  appliedPermissionProjectionTriggerFunctionUpdates = true;
}

async function hasCurrentWorkspaceInvitationColumns() {
  const rows = await db.$queryRaw<{ columnName: string }[]>`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_name = 'workspace_invitations'
      AND column_name IN ('requested_role', 'status', 'kind')
  `;
  return rows.length === 3;
}

test('PermissionProjectionModel checker returns mismatch and dirty-row counts', async t => {
  const queryResults = [
    [{ count: 1n }],
    [{ count: 2n }],
    [{ count: 3n }],
    [{ count: 4n }],
    [{ count: 5n }],
    [{ count: 6n }],
    [{ count: 7n }],
    [{ count: 8n }],
    [{ count: 9n }],
    [{ count: 10n }],
    [
      { category: 'legacy_doc_external_row', count: 11n },
      { category: 'doc_default_owner', count: 12n },
    ],
  ];
  const model = new TestPermissionProjectionModel({
    $queryRaw: async () => queryResults.shift(),
  });

  t.deepEqual(await model.checkLegacyProjection(), {
    oldWorkspacePolicyMismatch: 1,
    oldAcceptedMemberMismatch: 2,
    extraProjectedMember: 3,
    oldInvitationMismatch: 4,
    extraProjectedInvitation: 5,
    oldDocGrantMismatch: 6,
    extraProjectedDocGrant: 7,
    oldDocPolicyMismatch: 8,
    extraProjectedDocPolicy: 9,
    runtimeStateMissing: 0,
    runtimeStateMismatch: 0,
    ownerConflict: 10,
    oldNewDecisionMismatch: 0,
    invalidLegacyRows: {
      legacy_doc_external_row: 11,
      doc_default_owner: 12,
    },
  });
});

test('PermissionProjectionModel backfill runs with legacy origin in a long transaction', async t => {
  const executed: unknown[] = [];
  let transactionOptions: unknown;
  const model = new TestPermissionProjectionModel({
    $transaction: async (
      callback: (tx: unknown) => Promise<void>,
      options: unknown
    ) => {
      transactionOptions = options;
      await callback({
        $executeRaw: async (query: unknown) => {
          executed.push(query);
        },
      });
    },
  });

  await model.backfillLegacyProjection();

  t.is(executed.length, 11);
  t.deepEqual(transactionOptions, { timeout: 10 * 60 * 1000 });
  t.regex(String(executed[0]), /affine\.permission_sync_origin/);
});

test('PermissionProjectionModel exposes stable trigger metric categories', t => {
  t.deepEqual(PERMISSION_PROJECTION_TRIGGER_ERROR_CATEGORIES, [
    'owner_conflict',
    'invalid_legacy_role',
    'foreign_key_missing',
    'projection_recursion_guard_missing',
    'unknown',
  ]);
});

test('permission projection migration uses non-recursive origin guard', t => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'migrations/20260512133700_workspace_runtime_states/migration.sql'
    ),
    'utf8'
  );
  const guardBody = migration.match(
    /CREATE OR REPLACE FUNCTION affine_permission_should_project_from_legacy\(\)[\s\S]*?END\n\$\$;/
  )?.[0];

  t.truthy(guardBody);
  t.true(
    guardBody?.includes('IF NOT affine_permission_projection_enabled() THEN')
  );
  t.false(
    guardBody?.includes('IF NOT affine_permission_should_project_from_legacy()')
  );
  t.truthy(
    migration.match(
      /CREATE OR REPLACE FUNCTION affine_permission_should_project_from_new\(\)[\s\S]*?IF NOT affine_permission_projection_enabled\(\) THEN[\s\S]*?END\n\$\$;/
    )
  );
});

test('permission projection trigger maps legacy workspace permission rows', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const [admin, pending] = await module.create(Mockers.User, 2);

  await db.workspaceUserRole.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: admin.id,
        type: WorkspaceRole.Admin,
        status: WorkspaceMemberStatus.Accepted,
      },
      {
        workspaceId: workspace.id,
        userId: pending.id,
        type: WorkspaceRole.Collaborator,
        status: WorkspaceMemberStatus.Pending,
      },
    ],
  });

  const member = await db.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: workspace.id,
      userId: admin.id,
      state: 'active',
    },
  });
  const invitation = await db.workspaceInvitation.findUniqueOrThrow({
    where: {
      workspaceId_inviteeUserId: {
        workspaceId: workspace.id,
        inviteeUserId: pending.id,
      },
    },
  });

  t.is(member.role, 'admin');
  t.is(invitation.requestedRole, 'member');
  t.is(invitation.status, 'pending');
});

test('permission projection trigger maps legacy doc policy rows', async t => {
  const workspace = await module.create(Mockers.Workspace);

  await db.workspaceDoc.create({
    data: {
      workspaceId: workspace.id,
      docId: 'public-doc',
      public: true,
      defaultRole: DocRole.Reader,
    },
  });

  const policy = await db.docAccessPolicy.findUniqueOrThrow({
    where: {
      workspaceId_docId: {
        workspaceId: workspace.id,
        docId: 'public-doc',
      },
    },
  });

  t.is(policy.visibility, 'public');
  t.is(policy.publicRole, 'external');
  t.is(policy.memberDefaultRole, 'reader');
});

async function hasDocGrantLegacyProjectionColumns() {
  const rows = await db.$queryRaw<{ columnName: string }[]>`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_name = 'doc_grants'
      AND column_name IN (
        'legacy_workspace_id',
        'legacy_doc_id',
        'legacy_user_id'
      )
  `;
  return rows.length === 3;
}

test('permission projection trigger maps legacy doc grants and drops dirty rows', async t => {
  if (!(await hasDocGrantLegacyProjectionColumns())) {
    t.false(
      Boolean(process.env.CI),
      'current local test database predates doc_grants legacy columns'
    );
    return;
  }

  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);

  await db.workspaceDocUserRole.createMany({
    data: [
      {
        workspaceId: workspace.id,
        docId: 'valid-grant',
        userId: user.id,
        type: DocRole.Reader,
      },
      {
        workspaceId: workspace.id,
        docId: 'dirty-external',
        userId: user.id,
        type: DocRole.External,
      },
      {
        workspaceId: workspace.id,
        docId: 'dirty-none',
        userId: user.id,
        type: DocRole.None,
      },
    ],
  });

  const grants = await db.docGrant.findMany({
    where: {
      workspaceId: workspace.id,
      principalId: user.id,
    },
    orderBy: {
      docId: 'asc',
    },
  });

  t.deepEqual(
    grants.map(grant => [grant.docId, grant.role]),
    [['valid-grant', 'reader']]
  );
});

test('permission projection trigger clears legacy row for non-active new workspace member states', async t => {
  await applyPermissionProjectionTriggerFunctionUpdates();
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);

  const member = await db.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'member',
      state: 'active',
    },
  });

  t.truthy(
    await db.workspaceUserRole.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
    })
  );

  await db.workspaceMember.update({
    where: { id: member.id },
    data: { state: 'suspended' },
  });

  t.is(
    await db.workspaceUserRole.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
    }),
    null
  );
});

test('permission projection trigger clears legacy row for terminal new invitation statuses', async t => {
  if (!(await hasCurrentWorkspaceInvitationColumns())) {
    t.false(
      Boolean(process.env.CI),
      'current local test database predates workspace invitation projection columns'
    );
    return;
  }
  await applyPermissionProjectionTriggerFunctionUpdates();
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);

  const [invitation] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO workspace_invitations (
      workspace_id,
      invitee_user_id,
      requested_role,
      status,
      kind
    )
    VALUES (
      ${workspace.id},
      ${user.id},
      'member',
      'pending',
      'email'
    )
    RETURNING id
  `;

  t.is(
    (
      await db.workspaceUserRole.findUniqueOrThrow({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: user.id,
          },
        },
      })
    ).status,
    'Pending'
  );

  await db.$executeRaw`
    UPDATE workspace_invitations
    SET status = 'declined'
    WHERE id = ${invitation.id}
  `;

  t.is(
    await db.workspaceUserRole.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
    }),
    null
  );
});

test('permission projection trigger preserves doc metadata when new doc policy is deleted', async t => {
  await applyPermissionProjectionTriggerFunctionUpdates();
  const workspace = await module.create(Mockers.Workspace);

  await db.workspaceDoc.create({
    data: {
      workspaceId: workspace.id,
      docId: 'metadata-doc',
      public: true,
      defaultRole: DocRole.Reader,
      mode: 1,
      blocked: true,
      title: 'Title',
      summary: 'Summary',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    },
  });

  await db.docAccessPolicy.delete({
    where: {
      workspaceId_docId: {
        workspaceId: workspace.id,
        docId: 'metadata-doc',
      },
    },
  });

  const doc = await db.workspaceDoc.findUniqueOrThrow({
    where: {
      workspaceId_docId: {
        workspaceId: workspace.id,
        docId: 'metadata-doc',
      },
    },
  });

  t.is(doc.public, false);
  t.is(doc.defaultRole, DocRole.Manager);
  t.is(doc.publishedAt, null);
  t.is(doc.mode, 1);
  t.is(doc.blocked, true);
  t.is(doc.title, 'Title');
  t.is(doc.summary, 'Summary');
});

test('permission projection trigger ignores group doc grants on legacy projection', async t => {
  await applyPermissionProjectionTriggerFunctionUpdates();
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);

  await db.docGrant.create({
    data: {
      workspaceId: workspace.id,
      docId: 'group-doc',
      principalType: 'user',
      principalId: user.id,
      role: 'reader',
    },
  });
  await db.docGrant.create({
    data: {
      workspaceId: workspace.id,
      docId: 'group-doc',
      principalType: 'group',
      principalId: user.id,
      role: 'manager',
    },
  });
  await db.docGrant.delete({
    where: {
      workspaceId_docId_principalType_principalId: {
        workspaceId: workspace.id,
        docId: 'group-doc',
        principalType: 'group',
        principalId: user.id,
      },
    },
  });

  const legacyGrant = await db.workspaceDocUserRole.findUniqueOrThrow({
    where: {
      workspaceId_docId_userId: {
        workspaceId: workspace.id,
        docId: 'group-doc',
        userId: user.id,
      },
    },
  });

  t.is(legacyGrant.type, DocRole.Reader);
});

test('PermissionProjectionModel parses trigger error metric category', t => {
  t.is(
    permissionProjectionTriggerErrorCategory(
      new Error('permission_projection_error:owner_conflict:duplicate owner')
    ),
    'owner_conflict'
  );
  t.is(
    permissionProjectionTriggerErrorCategory(
      new Error('permission_projection_error:unexpected:nope')
    ),
    'unknown'
  );
  t.is(permissionProjectionTriggerErrorCategory(new Error('other')), null);
});

test('PermissionProjectionChecker reports old/new loader decision mismatches', async t => {
  const checker = new PermissionProjectionChecker(
    {
      workspace: {
        findMany: async () => [],
      },
      $queryRaw: async () => [
        {
          category: 'active_member_doc',
          workspaceId: 'w1',
          docId: 'doc1',
          userId: 'u1',
          workspaceActions: null,
          docActions: ['Doc.Read'],
        },
        {
          category: 'explicit_doc_grant',
          workspaceId: 'w1',
          docId: 'doc2',
          userId: 'u1',
          workspaceActions: null,
          docActions: ['Doc.Read'],
        },
        {
          category: 'workspace_invitation',
          workspaceId: 'w1',
          docId: null,
          userId: 'u2',
          workspaceActions: ['Workspace.Read'],
          docActions: null,
        },
      ],
    } as never,
    {
      permissionProjection: {
        checkLegacyProjection: async () => ({}),
      },
    } as never,
    {
      load: async (input: { docs?: [{ docId: string }] }) => ({
        version: 1,
        workspace: { marker: 'legacy' },
        docs: input.docs
          ? [{ docId: input.docs[0].docId, marker: 'legacy' }]
          : [],
      }),
      loadFromNewTables: async (input: { docs?: [{ docId: string }] }) => ({
        version: 1,
        workspace: { marker: input.docs ? 'legacy' : 'projection' },
        docs: input.docs
          ? [
              {
                docId: input.docs[0].docId,
                marker:
                  input.docs[0].docId === 'doc1' ? 'legacy' : 'projection',
              },
            ]
          : [],
      }),
    } as never,
    {
      evaluate: (input: unknown) => input,
    } as never
  );

  t.deepEqual(await checker.checkLegacyProjection(), {
    oldNewDecisionMismatch: 2,
  });
});
