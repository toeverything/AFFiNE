import test from 'ava';

import { DocActionDenied, SpaceAccessDenied } from '../../../base';
import { DocRole, WorkspaceRole } from '../../../models';
import { docLegacyBoundary, workspaceLegacyBoundary } from '../context';
import { PermissionService } from '../service';

test('PermissionService sends only actor, resource, and actions to Rust', async t => {
  const calls: unknown[] = [];
  const service = new PermissionService({
    authorizePermissionV1: async (input: unknown) => {
      calls.push(input);
      return {
        version: 1,
        workspace: { effectiveRole: 'member', decisions: [] },
        docs: [
          {
            docId: 'doc',
            effectiveRole: 'reader',
            decisions: [{ action: 'Doc.Read', allowed: true }],
          },
        ],
      };
    },
  } as never);

  const permissions = await service.docPermissions({
    userId: 'user',
    workspaceId: 'workspace',
    docId: 'doc',
    actions: ['Doc.Read'],
  });

  t.deepEqual(calls, [
    {
      version: 1,
      actorUserId: 'user',
      workspaceId: 'workspace',
      docs: [{ docId: 'doc', actions: ['Doc.Read'] }],
    },
  ]);
  t.is(permissions.effectiveRole, 'reader');
  t.is(permissions.legacyApiRole, DocRole.Reader);
  t.true(permissions.decisions[0].allowed);
});

test('PermissionService maps workspace and batch document results', async t => {
  const calls: unknown[] = [];
  const service = new PermissionService({
    authorizePermissionV1: async (input: unknown) => {
      calls.push(input);
      return {
        version: 1,
        workspace: {
          effectiveRole: 'owner',
          decisions: [{ action: 'Workspace.Read', allowed: true }],
        },
        docs: [
          {
            docId: 'first',
            effectiveRole: 'editor',
            decisions: [{ action: 'Doc.Update', allowed: true }],
          },
          {
            docId: 'second',
            effectiveRole: null,
            decisions: [{ action: 'Doc.Read', allowed: false }],
          },
        ],
      };
    },
  } as never);

  const workspace = await service.workspacePermissions({
    userId: 'user',
    workspaceId: 'workspace',
    actions: ['Workspace.Read'],
  });
  const docs = await service.batchDocPermissions({
    workspaceId: 'workspace',
    docs: [
      { docId: 'first', actions: ['Doc.Update'] },
      { docId: 'second', actions: ['Doc.Read'] },
    ],
  });

  t.deepEqual(calls, [
    {
      version: 1,
      actorUserId: 'user',
      workspaceId: 'workspace',
      workspaceActions: ['Workspace.Read'],
    },
    {
      version: 1,
      actorUserId: undefined,
      workspaceId: 'workspace',
      docs: [
        { docId: 'first', actions: ['Doc.Update'] },
        { docId: 'second', actions: ['Doc.Read'] },
      ],
    },
  ]);
  t.deepEqual(workspace, {
    effectiveRole: 'owner',
    legacyApiRole: WorkspaceRole.Owner,
    decisions: [{ action: 'Workspace.Read', allowed: true }],
  });
  t.deepEqual(docs, [
    {
      docId: 'first',
      effectiveRole: 'editor',
      legacyApiRole: DocRole.Editor,
      decisions: [{ action: 'Doc.Update', allowed: true }],
    },
    {
      docId: 'second',
      effectiveRole: null,
      legacyApiRole: null,
      decisions: [{ action: 'Doc.Read', allowed: false }],
    },
  ]);
});

test('legacy boundaries derive API roles from effective roles', t => {
  const cases = [
    {
      name: 'doc',
      actual: () =>
        docLegacyBoundary({
          docId: 'doc',
          effectiveRole: 'manager',
          decisions: [],
        }),
      expected: {
        effectiveRole: 'manager',
        legacyApiRole: DocRole.Manager,
      },
    },
    {
      name: 'workspace',
      actual: () =>
        workspaceLegacyBoundary({
          effectiveRole: 'admin',
          decisions: [],
        }),
      expected: {
        effectiveRole: 'admin',
        legacyApiRole: WorkspaceRole.Admin,
      },
    },
  ];
  for (const { name, actual, expected } of cases) {
    t.deepEqual(actual(), expected, name);
  }
});

test('PermissionService maps denied decisions to Node errors', async t => {
  const service = new PermissionService({
    authorizePermissionV1: async (input: {
      workspaceActions?: string[];
      docs?: Array<{ docId: string; actions: string[] }>;
    }) => ({
      version: 1,
      workspace: {
        effectiveRole: null,
        decisions: (input.workspaceActions ?? []).map(action => ({
          action,
          allowed: false,
        })),
      },
      docs: (input.docs ?? []).map(doc => ({
        docId: doc.docId,
        effectiveRole: null,
        decisions: doc.actions.map(action => ({ action, allowed: false })),
      })),
    }),
  } as never);

  const workspaceError = await t.throwsAsync(
    service.assertWorkspace({
      userId: 'user',
      workspaceId: 'workspace',
      action: 'Workspace.Read',
    })
  );
  const docError = await t.throwsAsync(
    service.assertDoc({
      userId: 'user',
      workspaceId: 'workspace',
      docId: 'doc',
      action: 'Doc.Update',
    })
  );

  t.true(workspaceError instanceof SpaceAccessDenied);
  t.true(docError instanceof DocActionDenied);
});

test('PermissionService propagates runtime authorizer failures', async t => {
  const service = new PermissionService({
    authorizePermissionV1: async () => {
      throw new Error('canonical permission snapshot unavailable');
    },
  } as never);

  await t.throwsAsync(
    service.docPermissions({
      workspaceId: 'workspace',
      docId: 'doc',
      actions: ['Doc.Read'],
    }),
    { message: 'canonical permission snapshot unavailable' }
  );
});
