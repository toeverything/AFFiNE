import { WorkspaceMemberStatus } from '@prisma/client';
import test from 'ava';

import { InternalServerError } from '../../../base';
import {
  DocRole,
  WorkspaceRole,
  type WorkspaceRuntimeState,
} from '../../../models';
import { PermissionReadModel } from '../config';
import { docLegacyBoundary } from '../context';
import { PermissionContextLoader } from '../context-loader';
import {
  PERMISSION_SHADOW_MISMATCH_CATEGORIES,
  PermissionDiagnosticService,
} from '../diagnostic';
import { PermissionService } from '../service';
import { PermissionSqlPredicateBuilder } from '../sql-predicate';

function createCls() {
  const store = new Map<string, unknown>();
  return {
    get(key: string) {
      return store.get(key);
    },
    set(key: string, value: unknown) {
      store.set(key, value);
    },
  };
}

function createLoader(
  runtimeState: WorkspaceRuntimeState = {
    workspaceId: 'w1',
    known: true,
    stale: false,
    readonly: false,
    readonlyReasons: [],
    updatedAt: new Date(),
    lastReconciledAt: new Date(),
    staleAfter: null,
  },
  docGrantRole: DocRole | null = null,
  queryRaw: (query: unknown) => Promise<unknown[]> = async () => []
) {
  const calls = {
    workspaceUser: 0,
    workspace: 0,
    runtime: 0,
    docPolicies: 0,
    docGrants: 0,
  };
  const models = {
    workspaceUser: {
      get: async () => {
        calls.workspaceUser += 1;
        return {
          type: WorkspaceRole.Owner,
          status: WorkspaceMemberStatus.Accepted,
        };
      },
    },
    workspace: {
      get: async () => {
        calls.workspace += 1;
        return {
          public: false,
          enableSharing: true,
          enableUrlPreview: true,
        };
      },
    },
    workspaceRuntimeState: {
      get: async () => {
        calls.runtime += 1;
        return runtimeState;
      },
    },
    doc: {
      findDefaultRoles: async (_workspaceId: string, docIds: string[]) => {
        calls.docPolicies += 1;
        return docIds.map(docId => ({
          workspace: docId === 'private' ? DocRole.None : DocRole.Manager,
          external: docId === 'public' ? DocRole.External : null,
        }));
      },
    },
    docUser: {
      findMany: async () => {
        calls.docGrants += 1;
        return docGrantRole === null
          ? []
          : [
              {
                docId: 'private',
                type: docGrantRole,
              },
            ];
      },
    },
  };
  return {
    calls,
    loader: new PermissionContextLoader(
      models as never,
      { $queryRaw: queryRaw } as never,
      createCls() as never
    ),
  };
}

test('PermissionService maps native decisions to legacy role boundary', async t => {
  const { loader } = createLoader();
  const service = new PermissionService(loader, undefined, undefined, {
    permission: {
      readModel: PermissionReadModel.Legacy,
      fallbackLegacyLoader: false,
    },
  } as never);

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

test('PermissionService uses new projection loader behind read flag', async t => {
  const calls: string[] = [];
  const service = new PermissionService(
    {
      load: async () => {
        calls.push('old');
        return { version: 1 } as never;
      },
      loadFromNewTables: async () => {
        calls.push('new');
        return { version: 1 } as never;
      },
    } as never,
    undefined,
    undefined,
    {
      permission: {
        readModel: PermissionReadModel.Projection,
        fallbackLegacyLoader: true,
      },
    } as never
  );
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

  t.deepEqual(calls, ['new']);
});

test('PermissionService falls back to old loader when new read fails', async t => {
  const calls: string[] = [];
  const service = new PermissionService(
    {
      load: async () => {
        calls.push('old');
        return { version: 1 } as never;
      },
      loadFromNewTables: async () => {
        calls.push('new');
        throw new Error('projection unavailable');
      },
    } as never,
    undefined,
    undefined,
    {
      permission: {
        readModel: PermissionReadModel.Projection,
        fallbackLegacyLoader: true,
      },
    } as never
  );
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

  t.deepEqual(calls, ['new', 'old']);
});

test('PermissionService can disable old evaluator fallback', async t => {
  const service = new PermissionService(
    {
      load: async () => ({ version: 1 }) as never,
      loadFromNewTables: async () => {
        throw new Error('projection unavailable');
      },
    } as never,
    undefined,
    undefined,
    {
      permission: {
        readModel: PermissionReadModel.Projection,
        fallbackLegacyLoader: false,
      },
    } as never
  );

  await t.throwsAsync(
    service.docPermissions({
      workspaceId: 'w1',
      docId: 'doc',
      actions: ['Doc.Read'],
    }),
    { message: 'projection unavailable' }
  );
});

test('PermissionService supports anonymous preview without doc read', async t => {
  const service = new PermissionService(
    createLoader().loader,
    undefined,
    undefined,
    {
      permission: {
        readModel: PermissionReadModel.Legacy,
        fallbackLegacyLoader: false,
      },
    } as never
  );

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

test('PermissionContextLoader passes missing runtime state as unknown and stale', async t => {
  const { loader } = createLoader({
    workspaceId: 'w1',
    known: false,
    stale: true,
    readonly: false,
    readonlyReasons: [],
    updatedAt: null,
    lastReconciledAt: null,
    staleAfter: null,
  });

  const input = await loader.load({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.CreateDoc'],
  });

  t.is(input.runtime?.known, false);
  t.is(input.runtime?.stale, true);
});

test('PermissionContextLoader falls back to quota runtime for missing legacy runtime state', async t => {
  const { loader } = createLoader(
    {
      workspaceId: 'w1',
      known: false,
      stale: true,
      readonly: false,
      readonlyReasons: [],
      updatedAt: null,
      lastReconciledAt: null,
      staleAfter: null,
    },
    null,
    async () => [
      {
        known: true,
        stale: false,
        readonly: true,
        readonlyReasons: ['storage_overflow'],
        staleAfter: null,
      },
    ]
  );

  const input = await loader.load({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.CreateDoc'],
  });

  t.true(input.runtime?.known);
  t.false(input.runtime?.stale);
  t.true(input.runtime?.readonly);
  t.is(input.runtime?.readonlyReason, 'storage_overflow');
});

test('PermissionContextLoader drops dirty external and none explicit rows', async t => {
  for (const role of [DocRole.None, DocRole.External]) {
    const { loader } = createLoader(undefined, role);
    const input = await loader.load({
      userId: 'u1',
      workspaceId: 'w1',
      docs: [{ docId: 'private', actions: ['Doc.Update'] }],
    });

    t.is(input.docs?.[0]?.explicitUserRole, undefined);
  }
});

test('PermissionContextLoader loads shadow input from new projection tables', async t => {
  const queryResults = [
    [{ role: 'admin', state: 'active' }],
    [
      {
        visibility: 'public',
        sharingEnabled: true,
        urlPreviewEnabled: true,
        memberDefaultDocRole: 'reader',
      },
    ],
    [
      {
        known: true,
        stale: false,
        readonly: true,
        readonlyReasons: ['storage_overflow'],
        staleAfter: null,
      },
    ],
    [
      {
        docId: 'doc1',
        visibility: 'public',
        publicRole: 'external',
        memberDefaultRole: null,
        urlPreviewEnabled: false,
      },
    ],
    [{ docId: 'doc1', role: 'manager' }],
  ];
  const { loader } = createLoader();
  const shadowLoader = new PermissionContextLoader(
    (loader as never as { models: never }).models,
    {
      $queryRaw: async () => queryResults.shift() ?? [],
    } as never,
    createCls() as never
  );

  const input = await shadowLoader.loadFromNewTables({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.Read'],
    docs: [{ docId: 'doc1', actions: ['Doc.Read'] }],
  });

  t.is(input.workspace?.role, 'admin');
  t.true(input.runtime?.readonly);
  t.is(input.runtime?.readonlyReason, 'storage_overflow');
  t.is(input.workspace?.public, true);
  t.is(input.docs?.[0]?.explicitUserRole, 'manager');
  t.is(input.docs?.[0]?.memberDefaultRole, 'reader');
  t.is(input.docs?.[0]?.publicRole, 'external');
});

test('PermissionContextLoader treats missing effective quota state as unknown and stale', async t => {
  const queryResults = [[], [], [], [], []];
  const { loader } = createLoader();
  const shadowLoader = new PermissionContextLoader(
    (loader as never as { models: never }).models,
    {
      $queryRaw: async () => queryResults.shift() ?? [],
      workspace: {
        findUnique: async () => ({ id: 'w1' }),
      },
    } as never,
    createCls() as never
  );

  const input = await shadowLoader.loadFromNewTables({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.CreateDoc'],
  });

  t.false(input.runtime?.known);
  t.true(input.runtime?.stale);
});

test('PermissionService refreshes cached runtime after write-action reconcile', async t => {
  let runtimeQueries = 0;
  const loader = new PermissionContextLoader(
    {
      workspaceUser: {
        get: async () => null,
      },
      workspace: {
        get: async () => ({
          public: false,
          enableSharing: true,
          enableUrlPreview: false,
        }),
      },
      workspaceRuntimeState: {
        get: async () => ({
          workspaceId: 'w1',
          known: false,
          stale: true,
          readonly: false,
          readonlyReasons: [],
        }),
      },
      doc: {
        findDefaultRoles: async () => [],
      },
      docUser: {
        findMany: async () => [],
      },
    } as never,
    {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('workspace_members')) {
          return [{ role: 'owner', state: 'active' }];
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
        if (sql.includes('effective_workspace_quota_states')) {
          runtimeQueries += 1;
          return runtimeQueries === 1
            ? []
            : [
                {
                  known: true,
                  stale: false,
                  readonly: false,
                  readonlyReasons: [],
                  staleAfter: null,
                },
              ];
        }
        return [];
      },
      workspace: {
        findUnique: async () => ({ id: 'w1' }),
      },
    } as never,
    createCls() as never
  );
  const service = new PermissionService(loader, undefined, {
    getWorkspaceState: async () => ({}),
  } as never);
  const runtimeKnownValues: Array<boolean | undefined> = [];
  service.evaluate = input => {
    runtimeKnownValues.push(input.runtime?.known);
    return {
      version: 1,
      workspace: {
        decisions: [
          {
            action: input.workspaceActions?.[0] ?? 'Workspace.Read',
            allowed: input.runtime?.known !== false,
            sources: [],
            restrictions: [],
          },
        ],
      },
      docs: [],
    };
  };

  t.false(
    await service.canWorkspace({
      userId: 'u1',
      workspaceId: 'w1',
      action: 'Workspace.Read',
    })
  );
  t.true(
    await service.canWorkspace({
      userId: 'u1',
      workspaceId: 'w1',
      action: 'Workspace.CreateDoc',
    })
  );
  t.deepEqual(runtimeKnownValues, [false, true]);
  t.is(runtimeQueries, 2);
});

test('PermissionService does not reconcile runtime for read-only workspace actions', async t => {
  let runtimeQueries = 0;
  let reconciles = 0;
  const loader = new PermissionContextLoader(
    {
      workspaceUser: {
        get: async () => null,
      },
      workspace: {
        get: async () => ({
          public: false,
          enableSharing: true,
          enableUrlPreview: false,
        }),
      },
      workspaceRuntimeState: {
        get: async () => null,
      },
      doc: {
        findDefaultRoles: async () => [],
      },
      docUser: {
        findMany: async () => [],
      },
    } as never,
    {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('workspace_members')) {
          return [{ role: 'owner', state: 'active' }];
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
        if (sql.includes('effective_workspace_quota_states')) {
          runtimeQueries += 1;
          return [];
        }
        return [];
      },
      workspace: {
        findUnique: async () => ({ id: 'w1' }),
      },
    } as never,
    createCls() as never
  );
  const service = new PermissionService(loader, undefined, {
    getWorkspaceState: async () => {
      reconciles += 1;
      return {};
    },
  } as never);
  service.evaluate = input => ({
    version: 1,
    workspace: {
      decisions: [
        {
          action: input.workspaceActions?.[0] ?? 'Workspace.Read',
          allowed: true,
          sources: [],
          restrictions: [],
        },
      ],
    },
    docs: [],
  });

  t.true(
    await service.canWorkspace({
      userId: 'u1',
      workspaceId: 'w1',
      action: 'Workspace.Settings.Read',
    })
  );
  t.is(runtimeQueries, 1);
  t.is(reconciles, 0);
});

test('PermissionService reconciles runtime for non-readonly write actions', async t => {
  let runtimeQueries = 0;
  let reconciles = 0;
  const loader = new PermissionContextLoader(
    {
      workspaceUser: {
        get: async () => null,
      },
      workspace: {
        get: async () => ({
          public: false,
          enableSharing: true,
          enableUrlPreview: false,
        }),
      },
      workspaceRuntimeState: {
        get: async () => null,
      },
      doc: {
        findDefaultRoles: async () => [],
      },
      docUser: {
        findMany: async () => [],
      },
    } as never,
    {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('workspace_members')) {
          return [{ role: 'owner', state: 'active' }];
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
        if (sql.includes('effective_workspace_quota_states')) {
          runtimeQueries += 1;
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
        return [];
      },
      workspace: {
        findUnique: async () => ({ id: 'w1' }),
      },
    } as never,
    createCls() as never
  );
  const service = new PermissionService(loader, undefined, {
    getWorkspaceState: async () => {
      reconciles += 1;
      return {};
    },
  } as never);
  service.evaluate = input => ({
    version: 1,
    workspace: {
      decisions: [
        {
          action: input.workspaceActions?.[0] ?? 'Workspace.Read',
          allowed: input.runtime?.known === true,
          sources: [],
          restrictions: [],
        },
      ],
    },
    docs: [],
  });

  t.true(
    await service.canWorkspace({
      userId: 'u1',
      workspaceId: 'w1',
      action: 'Workspace.Delete',
    })
  );
  t.is(runtimeQueries, 1);
  t.is(reconciles, 1);
});

for (const projectionLocalCase of [
  {
    name: 'does not treat missing projection as local workspace',
    workspaceId: 'w1',
    workspaceRow: { id: 'w1' },
    expectedLocal: false,
  },
  {
    name: 'allows local only when workspace is absent',
    workspaceId: 'local',
    workspaceRow: null,
    expectedLocal: true,
  },
] as const) {
  test(`PermissionContextLoader ${projectionLocalCase.name}`, async t => {
    const queryResults = [[], [], [], [], []];
    const { loader } = createLoader();
    const shadowLoader = new PermissionContextLoader(
      (loader as never as { models: never }).models,
      {
        $queryRaw: async () => queryResults.shift() ?? [],
        workspace: {
          findUnique: async () => projectionLocalCase.workspaceRow,
        },
      } as never,
      createCls() as never
    );

    const input = await shadowLoader.loadFromNewTables({
      userId: 'u1',
      workspaceId: projectionLocalCase.workspaceId,
      allowLocal: true,
    });

    t.is(input.workspace?.local, projectionLocalCase.expectedLocal);
  });
}

for (const shadowDocCase of [
  {
    name: 'reports projection mismatches',
    expectedMismatchType: 'rust_rule',
    buildEvaluate: () => {
      let index = 0;
      return () =>
        ({
          version: 1,
          workspace: {
            decisions: [],
          },
          docs: [
            {
              docId: 'doc1',
              decisions: [
                {
                  action: 'Doc.Read',
                  allowed: index++ === 0,
                  sources: [],
                  restrictions: [],
                },
              ],
            },
          ],
        }) as never;
    },
  },
  {
    name: 'classifies legacy API role mapping mismatches',
    expectedMismatchType: 'legacy_api_role_mapping',
    buildEvaluate: () => {
      let index = 0;
      return () =>
        ({
          version: 1,
          workspace: {
            decisions: [],
          },
          docs: [
            {
              docId: 'doc1',
              effectiveRole: index++ === 0 ? 'owner' : 'manager',
              resourceOwnerRole: null,
              decisions: [],
            },
          ],
        }) as never;
    },
  },
  {
    name: 'accepts explicit expected delta categories',
    expectedDeltaCategory: 'legacy_compat_delta',
    expectedMismatchType: 'legacy_compat_delta',
    buildEvaluate: () => {
      let index = 0;
      return () =>
        ({
          version: 1,
          workspace: {
            decisions: [],
          },
          docs: [
            {
              docId: 'doc1',
              decisions: [
                {
                  action: 'Doc.Read',
                  allowed: index++ === 0,
                  sources: [],
                  restrictions: [],
                },
              ],
            },
          ],
        }) as never;
    },
  },
] as const) {
  test(`PermissionDiagnosticService ${shadowDocCase.name}`, async t => {
    const loader = {
      load: async () => ({ version: 1 }) as never,
      loadFromNewTables: async () => ({ version: 1 }) as never,
    } as never;
    const permission = new PermissionService(loader);
    permission.evaluate = shadowDocCase.buildEvaluate();
    const service = new PermissionDiagnosticService(loader, permission);

    const result = await service.shadowDocPermissions({
      workspaceId: 'w1',
      docs: [{ docId: 'doc1', actions: ['Doc.Read'] }],
      expectedDeltaCategory: shadowDocCase.expectedDeltaCategory,
    });

    t.false(result.matched);
    t.is(result.mismatchType, shadowDocCase.expectedMismatchType);
  });
}

test('PermissionDiagnosticService compares SQL predicate shadow doc read results', async t => {
  const loader = {
    loadFromNewTables: async () => ({ version: 1 }) as never,
  } as never;
  const permission = new PermissionService(loader);
  permission.evaluate = () =>
    ({
      version: 1,
      workspace: { decisions: [] },
      docs: ['ok', 'missing', 'extra'].map(docId => ({
        docId,
        decisions: [
          {
            action: 'Doc.Read',
            allowed: docId !== 'extra',
            sources: [],
            restrictions: [],
          },
        ],
      })),
    }) as never;
  const service = new PermissionDiagnosticService(loader, permission);

  const result = await service.shadowSqlDocRead({
    userId: 'u1',
    workspaceId: 'w1',
    docs: [{ docId: 'ok' }, { docId: 'missing' }, { docId: 'extra' }],
    sqlReadableDocIds: ['ok', 'extra'],
  });

  t.false(result.matched);
  t.is(result.mismatchType, 'sql_predicate');
  t.deepEqual(result.missingInSql, ['missing']);
  t.deepEqual(result.extraInSql, ['extra']);
  t.true(result.predicate.sql.includes('doc_access_policies'));
});

test('PermissionDiagnosticService preview shadow flags preview/read coupling', async t => {
  const loader = {
    load: async () => ({ version: 1 }) as never,
    loadFromNewTables: async () => ({ version: 1 }) as never,
  } as never;
  const permission = new PermissionService(loader);
  const service = new PermissionDiagnosticService(loader, permission);
  let index = 0;
  permission.evaluate = () =>
    ({
      version: 1,
      workspace: {
        decisions: [],
      },
      docs: [
        {
          docId: 'doc1',
          decisions: [
            {
              action: 'Doc.Preview',
              allowed: true,
              sources: [],
              restrictions: [],
            },
            {
              action: 'Doc.Read',
              allowed: index++ === 1,
              sources: [],
              restrictions: [],
            },
          ],
        },
      ],
    }) as never;

  const result = await service.shadowPreviewDoc({
    workspaceId: 'w1',
    docId: 'doc1',
  });

  t.false(result.matched);
  t.is(result.mismatchType, 'preview_read_mapping');
});

test('PermissionDiagnosticService keeps public preview/read shadow as normal match', async t => {
  const loader = {
    load: async () => ({ version: 1 }) as never,
    loadFromNewTables: async () => ({ version: 1 }) as never,
  } as never;
  const permission = new PermissionService(loader);
  const service = new PermissionDiagnosticService(loader, permission);
  permission.evaluate = () =>
    ({
      version: 1,
      workspace: {
        decisions: [],
      },
      docs: [
        {
          docId: 'doc1',
          decisions: [
            {
              action: 'Doc.Preview',
              allowed: true,
              sources: [],
              restrictions: [],
            },
            {
              action: 'Doc.Read',
              allowed: true,
              sources: [],
              restrictions: [],
            },
          ],
        },
      ],
    }) as never;

  const result = await service.shadowPreviewDoc({
    workspaceId: 'w1',
    docId: 'doc1',
  });

  t.true(result.matched);
  t.is(result.mismatchType, null);
});

test('PermissionDiagnosticService exposes shadow mismatch categories', t => {
  t.deepEqual(PERMISSION_SHADOW_MISMATCH_CATEGORIES, [
    'legacy_compat_delta',
    'projection',
    'rust_rule',
    'loader',
    'sql_predicate',
    'legacy_api_role_mapping',
    'preview_read_mapping',
    'runtime_state',
    'projection_or_loader',
  ]);
});

test('PermissionService maps native validation errors to internal errors', t => {
  const service = new PermissionService(createLoader().loader);

  const error = t.throws(() =>
    service.evaluate({
      version: 2,
    } as never)
  );

  t.true(error instanceof InternalServerError);
});

test('PermissionContextLoader memoizes permission context within a request', async t => {
  const { loader, calls } = createLoader();

  await loader.load({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.Read'],
    docs: [{ docId: 'public', actions: ['Doc.Read'] }],
  });
  await loader.load({
    userId: 'u1',
    workspaceId: 'w1',
    workspaceActions: ['Workspace.Read'],
    docs: [{ docId: 'public', actions: ['Doc.Read'] }],
  });

  t.deepEqual(calls, {
    workspaceUser: 1,
    workspace: 1,
    runtime: 1,
    docPolicies: 1,
    docGrants: 1,
  });
});

test('PermissionSqlPredicateBuilder builds legacy-table predicate parameters', t => {
  const predicate =
    new PermissionSqlPredicateBuilder().docReadableByLegacyTables({
      workspaceId: 'w1',
      userId: 'u1',
      action: 'Doc.Users.Manage',
      docIdColumn: 'docs.id',
    });

  t.true(predicate.sql.includes('workspace_page_user_permissions'));
  t.deepEqual(predicate.params.slice(0, 3), ['u1', 'u1', 'w1']);
  t.true(
    predicate.params
      .slice(3)
      .filter(Array.isArray)
      .every(value => value.every(Number.isInteger))
  );
});

test('PermissionSqlPredicateBuilder rejects unsafe raw doc id columns', t => {
  const builder = new PermissionSqlPredicateBuilder();

  t.throws(
    () =>
      builder.docReadableByLegacyTables({
        workspaceId: 'w1',
        userId: 'u1',
        action: 'Doc.Read',
        docIdColumn: 'docs.id; DROP TABLE docs' as never,
      }),
    { message: 'Unsupported doc id column: docs.id; DROP TABLE docs' }
  );
  t.throws(
    () =>
      builder.docReadableByNewTables({
        workspaceId: 'w1',
        userId: 'u1',
        action: 'Doc.Read',
        docIdColumn: 'docs.id; DROP TABLE docs' as never,
      }),
    { message: 'Unsupported doc id column: docs.id; DROP TABLE docs' }
  );
});

test('PermissionSqlPredicateBuilder drops dirty legacy external explicit grants', t => {
  const predicate =
    new PermissionSqlPredicateBuilder().docReadableByLegacyTables({
      workspaceId: 'w1',
      userId: 'u1',
      action: 'Doc.Read',
    });

  const roles = predicate.params[4] as DocRole[];
  t.false(roles.includes(DocRole.External));
  t.true(roles.includes(DocRole.Reader));
});

test('PermissionSqlPredicateBuilder treats legacy workspace external rows as non-members', t => {
  const predicate =
    new PermissionSqlPredicateBuilder().docReadableByLegacyTables({
      workspaceId: 'w1',
      userId: 'u1',
      action: 'Doc.Users.Manage',
    });

  const activeMemberRoles = predicate.params[3] as WorkspaceRole[];
  t.false(activeMemberRoles.includes(WorkspaceRole.External));
});

test('PermissionSqlPredicateBuilder caps non-member explicit grants below manager', t => {
  const builder = new PermissionSqlPredicateBuilder();
  const update = builder.docReadableByNewTables({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Update',
  });
  const transferOwner = builder.docReadableByNewTables({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.TransferOwner',
  });

  t.true((update.params[4] as string[]).includes('editor'));
  t.true((update.params[4] as string[]).includes('manager'));
  t.true((update.params[4] as string[]).includes('owner'));
  t.deepEqual(transferOwner.params[3], ['owner']);
  t.deepEqual(transferOwner.params[4], []);
});

test('PermissionSqlPredicateBuilder suppresses member default when explicit grant exists', t => {
  const builder = new PermissionSqlPredicateBuilder();
  const legacy = builder.docReadableByLegacyTablesSql({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Update',
  });
  const projection = builder.docReadableByNewTables({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Update',
  });

  t.true(legacy.sql.includes('p.user_id IS NULL'));
  t.true(projection.sql.includes('dg.principal_id IS NULL'));
});

test('PermissionSqlPredicateBuilder accepts representative doc actions', t => {
  const builder = new PermissionSqlPredicateBuilder();
  const actions = [
    'Doc.Read',
    'Doc.Update',
    'Doc.Duplicate',
    'Doc.Users.Manage',
    'Doc.TransferOwner',
  ] as const;

  for (const action of actions) {
    const legacy = builder.docReadableByLegacyTables({
      workspaceId: 'w1',
      userId: 'u1',
      action: action as never,
    });
    const projection = builder.docReadableByNewTables({
      workspaceId: 'w1',
      userId: 'u1',
      action: action as never,
    });

    t.true(legacy.sql.includes('workspace_page_user_permissions'));
    t.true(projection.sql.includes('workspace_access_policies'));
  }
});

test('PermissionService chooses SQL predicate from configured read model and fallback flag', t => {
  const { loader } = createLoader();
  const legacy = new PermissionService(loader, undefined, undefined, {
    permission: {
      readModel: PermissionReadModel.Legacy,
      fallbackLegacyLoader: true,
    },
  } as never).docReadableSqlPredicate({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Read',
  });
  const projection = new PermissionService(loader, undefined, undefined, {
    permission: {
      readModel: PermissionReadModel.Projection,
      fallbackLegacyLoader: false,
    },
  } as never).docReadableSqlPredicate({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Read',
  });
  const projectionWithFallback = new PermissionService(
    loader,
    undefined,
    undefined,
    {
      permission: {
        readModel: PermissionReadModel.Projection,
        fallbackLegacyLoader: true,
      },
    } as never
  ).docReadableSqlPredicate({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Read',
  });
  const fallback = new PermissionService(loader, undefined, undefined, {
    permission: {
      readModel: PermissionReadModel.Projection,
      fallbackLegacyLoader: true,
    },
  } as never).fallbackDocReadableSqlPredicate({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Read',
  });

  t.true(
    (legacy as unknown as { sql: string }).sql.includes(
      'workspace_user_permissions'
    )
  );
  t.false(
    (legacy as unknown as { sql: string }).sql.includes(
      'workspace_access_policies'
    )
  );
  t.true(
    (projection as unknown as { sql: string }).sql.includes(
      'workspace_access_policies'
    )
  );
  t.true(
    (projectionWithFallback as unknown as { sql: string }).sql.includes(
      'workspace_access_policies'
    )
  );
  t.false(
    (projectionWithFallback as unknown as { sql: string }).sql.includes(
      'workspace_user_permissions'
    )
  );
  t.true(
    (fallback as unknown as { sql: string }).sql.includes(
      'workspace_user_permissions'
    )
  );
});

test('PermissionSqlPredicateBuilder uses new projection tables for shadow read', t => {
  const predicate = new PermissionSqlPredicateBuilder().docReadableByNewTables({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Read',
    docIdColumn: 'docs.id',
  });

  t.true(predicate.sql.includes('FROM workspace_access_policies wap'));
  t.true(predicate.sql.includes('LEFT JOIN doc_access_policies dap'));
  t.true(predicate.sql.includes('workspace_members'));
  t.true(predicate.sql.includes('doc_grants'));
  t.true(predicate.sql.includes('dap.doc_id = docs.id'));
  t.true(
    predicate.sql.includes(
      'COALESCE(dap.member_default_role, wap.member_default_doc_role)'
    )
  );
  t.deepEqual(predicate.params.slice(0, 3), ['u1', 'u1', 'w1']);
});

test('PermissionSqlPredicateBuilder emits new-table role parameters as strings', t => {
  const builder = new PermissionSqlPredicateBuilder();
  const transferOwner = builder.docReadableByNewTables({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.TransferOwner',
  });
  const manageUsers = builder.docReadableByNewTables({
    workspaceId: 'w1',
    userId: 'u1',
    action: 'Doc.Users.Manage',
  });

  for (const predicate of [transferOwner, manageUsers]) {
    t.true(
      predicate.params
        .slice(3)
        .every(
          value =>
            Array.isArray(value) &&
            value.every(role => typeof role === 'string')
        )
    );
  }
});
