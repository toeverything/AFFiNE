import test from 'ava';

import {
  InternalServerError,
  SearchIndexFailed,
  SearchIndexNotReady,
  SearchPermissionSyncing,
  SearchProviderUnavailable,
  SpaceAccessDenied,
} from '../../../base';
import { DocRole } from '../../../models';
import { docLegacyBoundary } from '../context';
import { PermissionContextLoader } from '../context-loader';
import { PermissionService } from '../service';

function createCls() {
  const store = new Map<string, unknown>();
  return {
    isActive: () => true,
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
  };
}

function createLoader() {
  const calls = {
    members: 0,
    policies: 0,
    runtime: 0,
    docPolicies: 0,
    docGrants: 0,
  };
  const queries: string[] = [];
  const db = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('');
      queries.push(sql);
      if (sql.includes('FROM workspace_members')) {
        calls.members += 1;
        return [{ role: 'owner', state: 'active' }];
      }
      if (sql.includes('FROM workspace_access_policies')) {
        calls.policies += 1;
        return [
          {
            visibility: 'private',
            sharingEnabled: true,
            urlPreviewEnabled: true,
            memberDefaultDocRole: 'manager',
          },
        ];
      }
      if (sql.includes('FROM effective_workspace_quota_states')) {
        calls.runtime += 1;
        return [
          {
            known: true,
            stale: false,
            readonly: false,
            readonlyReasons: [],
            staleAfter: null,
          },
        ];
      }
      if (sql.includes('FROM doc_access_policies')) {
        calls.docPolicies += 1;
        return [
          {
            docId: 'public',
            visibility: 'public',
            publicRole: 'external',
            memberDefaultRole: null,
            urlPreviewEnabled: false,
          },
        ];
      }
      if (sql.includes('FROM doc_grants')) {
        calls.docGrants += 1;
        return [
          {
            docId: 'private',
            role: 'manager',
          },
        ];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    workspace: {
      findUnique: async () => ({ id: 'w1' }),
    },
  };
  return {
    calls,
    queries,
    loader: new PermissionContextLoader(db as never, createCls() as never),
  };
}

test('PermissionService maps native decisions to legacy role boundary', async t => {
  const service = new PermissionService(createLoader().loader);

  const permissions = await service.docPermissions({
    userId: 'u1',
    workspaceId: 'w1',
    docId: 'private',
    actions: ['Doc.TransferOwner'],
  });

  t.is(permissions.effectiveRole, 'owner');
  t.is(permissions.resourceOwnerRole, null);
  t.is(permissions.legacyApiRole, DocRole.Owner);
  t.true(permissions.decisions[0].allowed);
});

test('doc legacy boundary keeps resource owner and effective role separate', t => {
  t.deepEqual(
    docLegacyBoundary({
      docId: 'doc',
      resourceOwnerRole: 'owner',
      effectiveRole: 'manager',
      decisions: [],
    }),
    {
      resourceOwnerRole: 'owner',
      effectiveRole: 'manager',
      legacyApiRole: DocRole.Manager,
    }
  );
  t.deepEqual(
    docLegacyBoundary({
      docId: 'public',
      effectiveRole: 'external',
      decisions: [],
    }),
    {
      resourceOwnerRole: null,
      effectiveRole: 'external',
      legacyApiRole: DocRole.External,
    }
  );
});

test('PermissionService uses the terminal loader without fallback', async t => {
  const calls: string[] = [];
  const service = new PermissionService({
    load: async () => {
      calls.push('load');
      return { version: 1 } as never;
    },
  } as never);
  service.evaluate = () =>
    ({
      version: 1,
      workspace: { decisions: [] },
      docs: [
        {
          docId: 'doc',
          effectiveRole: 'reader',
          decisions: [],
        },
      ],
    }) as never;

  await service.docPermissions({
    workspaceId: 'w1',
    docId: 'doc',
    actions: ['Doc.Read'],
  });

  t.deepEqual(calls, ['load']);
});

test('PermissionService propagates terminal loader failures', async t => {
  const service = new PermissionService({
    load: async () => {
      throw new Error('permission tables unavailable');
    },
  } as never);

  await t.throwsAsync(
    service.docPermissions({
      workspaceId: 'w1',
      docId: 'doc',
      actions: ['Doc.Read'],
    }),
    { message: 'permission tables unavailable' }
  );
});

test('PermissionService supports anonymous preview without doc read', async t => {
  const service = new PermissionService(createLoader().loader);

  t.true(
    await service.canPreviewDoc({
      workspaceId: 'w1',
      docId: 'private',
    })
  );
  t.false(
    await service.canDoc({
      workspaceId: 'w1',
      docId: 'private',
      action: 'Doc.Read',
    })
  );
});

test('PermissionContextLoader reads only terminal permission tables', async t => {
  const { loader, queries } = createLoader();
  const input = await loader.load({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.Read'],
    docs: [
      { docId: 'private', actions: ['Doc.Update'] },
      { docId: 'public', actions: ['Doc.Read'] },
    ],
  });

  t.is(input.workspace?.role, 'owner');
  t.true(input.runtime?.known);
  t.is(input.docs?.[0]?.explicitUserRole, 'manager');
  t.is(input.docs?.[0]?.memberDefaultRole, 'manager');
  t.is(input.docs?.[1]?.publicRole, 'external');
  t.false(
    queries.some(query => /workspace_permission_|search_runtime_/i.test(query))
  );
});

test('PermissionContextLoader treats missing quota state as unknown and stale', async t => {
  const db = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('');
      if (sql.includes('effective_workspace_quota_states')) {
        return [];
      }
      if (sql.includes('workspace_access_policies')) {
        return [
          {
            visibility: 'private',
            sharingEnabled: true,
            urlPreviewEnabled: false,
            memberDefaultDocRole: 'manager',
          },
        ];
      }
      return [];
    },
    workspace: { findUnique: async () => ({ id: 'w1' }) },
  };
  const loader = new PermissionContextLoader(db as never);

  const input = await loader.load({
    workspaceId: 'w1',
    workspaceActions: ['Workspace.CreateDoc'],
  });

  t.false(input.runtime?.known);
  t.true(input.runtime?.stale);
});

test('PermissionContextLoader memoizes quota runtime within a request', async t => {
  const { loader, calls } = createLoader();

  await loader.load({ workspaceId: 'w1' });
  await loader.load({ workspaceId: 'w1' });

  t.is(calls.runtime, 1);
});

test('PermissionService maps native validation errors to internal errors', t => {
  const service = new PermissionService(createLoader().loader);
  const error = t.throws(() => service.evaluate({ version: 2 } as never));

  t.true(error instanceof InternalServerError);
});

test('search and permission boundaries expose stable HTTP contracts', t => {
  t.is(new SearchIndexNotReady({ spaceId: 'w1' }).status, 503);
  t.is(new SearchPermissionSyncing().status, 503);
  t.is(new SearchProviderUnavailable().status, 503);
  t.is(new SearchIndexFailed({ diagnosticId: 'w1' }).status, 503);
  t.is(new SpaceAccessDenied({ spaceId: 'w1' }).status, 403);
});
