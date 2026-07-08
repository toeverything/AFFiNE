import {
  getRealtimeInputKey,
  type WorkspaceQuotaStateSnapshot,
} from '@affine/realtime';
import test from 'ava';
import { z } from 'zod';

import { CANARY_CLIENT_VERSION_MAX_AGE_DAYS } from '../../../base';
import { Flavor } from '../../../env';
import { PublicDocMode } from '../../../models';
import { CopilotEmbeddingRealtimeProvider } from '../../../plugins/copilot/context';
import type { CopilotTranscriptionReader } from '../../../plugins/copilot/transcript';
import { CopilotTranscriptRealtimeProvider } from '../../../plugins/copilot/transcript';
import type { CurrentUser } from '../../auth';
import { CommentRealtimeProvider } from '../../comment/realtime';
import { NotificationRealtimeProvider } from '../../notification/realtime';
import {
  DocRole,
  type PermissionAccess,
  WorkspaceRole,
} from '../../permission';
import { QuotaStateRealtimeProvider } from '../../quota/realtime';
import { UserRealtimeProvider } from '../../user/realtime';
import {
  DocGrantsRealtimeProvider,
  DocShareRealtimeProvider,
} from '../../workspaces/doc-realtime';
import {
  WorkspaceAccessRealtimeProvider,
  WorkspaceConfigRealtimeProvider,
  WorkspaceMembersRealtimeProvider,
} from '../../workspaces/realtime';
import { RealtimeRegistryCompletenessChecker } from '../completeness';
import { RealtimeGateway } from '../gateway';
import {
  REALTIME_GATEWAY_REQUIRED_REQUESTS,
  REALTIME_GATEWAY_REQUIRED_TOPICS,
  realtimeCommentRoom,
  realtimeDocGrantsRoom,
  realtimeDocShareStateRoom,
  realtimeNotificationRoom,
  realtimeTranscriptTaskRoom,
  realtimeUserAccessTokensRoom,
  realtimeUserProfileRoom,
  realtimeUserSettingsRoom,
  realtimeWorkspaceAccessRoom,
  realtimeWorkspaceConfigRoom,
  realtimeWorkspaceEmbeddingProgressRoom,
  realtimeWorkspaceInviteLinkRoom,
  realtimeWorkspaceMembersRoom,
  realtimeWorkspaceQuotaStateRoom,
  registerRealtimeLiveQuery,
} from '../index';
import { RealtimePublisher } from '../publisher';
import { RealtimeRegistry } from '../registry';

const user: CurrentUser = {
  id: 'u1',
  email: 'u1@affine.pro',
  name: 'User',
  avatarUrl: null,
  disabled: false,
  hasPassword: true,
  emailVerified: true,
};

function makeCanaryDateVersion(date: Date, build = '015') {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}-canary.${build}`;
}

function createGateway(registry: RealtimeRegistry) {
  return new RealtimeGateway(registry, {
    attachServer() {},
    publishLocal() {},
  } as unknown as RealtimePublisher);
}

test('registry rejects duplicate request and topic handlers', t => {
  const registry = new RealtimeRegistry();
  const request = {
    name: 'notification.count.get' as const,
    input: z.object({}).strict(),
    handle: async () => ({ count: 0 }),
  };
  const topic = {
    name: 'notification.count.changed' as const,
    input: z.object({}).strict(),
    authorize: async () => {},
    room: () => 'room',
  };

  registry.registerRequest(request);
  registry.registerTopic(topic);

  t.throws(() => registry.registerRequest(request), {
    message: /already registered/,
  });
  t.throws(() => registry.registerTopic(topic), {
    message: /already registered/,
  });
});

test('realtime registry completeness check only runs for explicit gateway flavors', t => {
  const env = globalThis.env as unknown as { FLAVOR: Flavor };
  const originalFlavor = globalThis.env.FLAVOR;
  try {
    const checker = new RealtimeRegistryCompletenessChecker(
      new RealtimeRegistry()
    );

    env.FLAVOR = Flavor.AllInOne;
    t.notThrows(() => checker.onApplicationBootstrap());

    env.FLAVOR = Flavor.Front;
    t.throws(() => checker.onApplicationBootstrap(), {
      message: /Realtime gateway missing handlers/,
    });
  } finally {
    env.FLAVOR = originalFlavor;
  }
});

test('gateway handles registered request with version gate', async t => {
  const registry = new RealtimeRegistry();
  registry.registerRequest({
    name: 'notification.count.get',
    input: z.object({}).strict(),
    handle: async currentUser => ({ count: currentUser.id === 'u1' ? 1 : 0 }),
  });
  const gateway = createGateway(registry);

  t.deepEqual(
    await gateway.onRequest(user, {
      op: 'notification.count.get',
      input: {},
      clientVersion: '0.26.0',
    }),
    { data: { count: 1 } }
  );
  t.like(
    await gateway.onRequest(user, {
      op: 'notification.count.get',
      input: {},
      clientVersion: '0.25.0',
    }),
    { error: { code: 'UNSUPPORTED_CLIENT_VERSION' } }
  );
});

test('gateway accepts canary date client version in canary namespace', async t => {
  const originalNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'dev';
  try {
    const registry = new RealtimeRegistry();
    registry.registerRequest({
      name: 'notification.count.get',
      input: z.object({}).strict(),
      handle: async () => ({ count: 1 }),
    });
    const gateway = createGateway(registry);

    t.deepEqual(
      await gateway.onRequest(user, {
        op: 'notification.count.get',
        input: {},
        clientVersion: makeCanaryDateVersion(new Date(), '040'),
      }),
      { data: { count: 1 } }
    );

    const old = new Date(
      Date.now() -
        (CANARY_CLIENT_VERSION_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000
    );
    t.like(
      await gateway.onRequest(user, {
        op: 'notification.count.get',
        input: {},
        clientVersion: makeCanaryDateVersion(old, '040'),
      }),
      { error: { code: 'UNSUPPORTED_CLIENT_VERSION' } }
    );
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = originalNamespace;
  }
});

test('gateway rejects canary date client version outside canary namespace', async t => {
  const originalNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'production';
  try {
    const registry = new RealtimeRegistry();
    registry.registerRequest({
      name: 'notification.count.get',
      input: z.object({}).strict(),
      handle: async () => ({ count: 1 }),
    });
    const gateway = createGateway(registry);

    t.like(
      await gateway.onRequest(user, {
        op: 'notification.count.get',
        input: {},
        clientVersion: makeCanaryDateVersion(new Date(), '40'),
      }),
      { error: { code: 'UNSUPPORTED_CLIENT_VERSION' } }
    );
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = originalNamespace;
  }
});

test('gateway authorizes subscription and joins room', async t => {
  const registry = new RealtimeRegistry();
  registry.registerTopic({
    name: 'comment.changed',
    input: z.object({ workspaceId: z.string(), docId: z.string() }),
    authorize: async (_currentUser, input) => {
      if (input.workspaceId !== 'space') {
        throw new Error('denied');
      }
    },
    room: (_currentUser, input) => `workspace:${input.workspaceId}`,
  });
  const gateway = createGateway(registry);
  const joined: string[] = [];
  const client = {
    id: 'socket-1',
    join: async (room: string) => {
      joined.push(room);
    },
    leave: async (room: string) => {
      joined.splice(joined.indexOf(room), 1);
    },
  };

  const result = await gateway.onSubscribe(user, client as never, {
    topic: 'comment.changed',
    input: { workspaceId: 'space', docId: 'doc' },
    clientVersion: '0.26.0',
  });

  t.deepEqual(joined, ['workspace:space']);
  t.deepEqual(result, {
    data: {
      subscriptionId: `socket-1:comment.changed:${getRealtimeInputKey({
        workspaceId: 'space',
        docId: 'doc',
      })}`,
    },
  });

  t.like(
    await gateway.onSubscribe(user, client as never, {
      topic: 'comment.changed',
      input: { workspaceId: 'other', docId: 'doc' },
      clientVersion: '0.26.0',
    }),
    { error: { code: 'INTERNAL_SERVER_ERROR' } }
  );
});

test('getRealtimeInputKey is deterministic for subscription input keys', t => {
  t.is(
    getRealtimeInputKey({ docId: 'doc', workspaceId: 'space' }),
    getRealtimeInputKey({ workspaceId: 'space', docId: 'doc' })
  );
});

test('getRealtimeInputKey follows JSON semantics for subscription input keys', t => {
  t.is(getRealtimeInputKey({ after: undefined }), getRealtimeInputKey({}));
  t.is(getRealtimeInputKey([undefined]), '[null]');
  t.is(
    getRealtimeInputKey(new Date('2026-01-02T03:04:05.000Z')),
    '"2026-01-02T03:04:05.000Z"'
  );
});

test('room helpers produce stable realtime room names', t => {
  t.is(realtimeNotificationRoom('u1'), 'user:u1:notification');
  t.is(realtimeCommentRoom('space', 'doc'), 'workspace:space:doc:doc:comment');
  t.is(
    realtimeWorkspaceEmbeddingProgressRoom('space'),
    'workspace:space:embedding-progress'
  );
  t.is(realtimeWorkspaceAccessRoom('space'), 'workspace:space:access');
  t.is(realtimeWorkspaceConfigRoom('space'), 'workspace:space:config');
  t.is(realtimeWorkspaceMembersRoom('space'), 'workspace:space:members');
  t.is(realtimeWorkspaceInviteLinkRoom('space'), 'workspace:space:invite-link');
  t.is(
    realtimeDocShareStateRoom('space', 'doc'),
    'workspace:space:doc:doc:share-state'
  );
  t.is(realtimeDocGrantsRoom('space', 'doc'), 'workspace:space:doc:doc:grants');
  t.is(realtimeUserProfileRoom('u1'), 'user:u1:profile');
  t.is(realtimeUserSettingsRoom('u1'), 'user:u1:settings');
  t.is(realtimeUserAccessTokensRoom('u1'), 'user:u1:access-tokens');
  t.is(
    realtimeTranscriptTaskRoom('space', 'task'),
    'copilot:transcript:space:task'
  );
});

test('registerRealtimeLiveQuery registers paired request and topic handlers', async t => {
  const registry = new RealtimeRegistry();

  registerRealtimeLiveQuery(registry, {
    request: {
      name: 'notification.count.get',
      input: z.object({}).strict(),
      handle: async () => ({ count: 7 }),
    },
    topic: {
      name: 'notification.count.changed',
      input: z.object({}).strict(),
      authorize: async () => {},
      room: currentUser => `user:${currentUser?.id}:notification`,
    },
  });

  t.deepEqual(
    await registry.getRequest('notification.count.get').handle(user, {}),
    {
      count: 7,
    }
  );
  t.is(
    registry.getTopic('notification.count.changed').room(user, {}),
    'user:u1:notification'
  );
});

test('realtime providers expose runtime injection metadata for registry dependencies', t => {
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      NotificationRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata('design:paramtypes', CommentRealtimeProvider).includes(
      RealtimeRegistry
    )
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      CopilotTranscriptRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      CopilotEmbeddingRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      QuotaStateRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      WorkspaceAccessRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      WorkspaceConfigRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      WorkspaceMembersRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata('design:paramtypes', DocShareRealtimeProvider).includes(
      RealtimeRegistry
    )
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      DocGrantsRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata('design:paramtypes', UserRealtimeProvider).includes(
      RealtimeRegistry
    )
  );
});

test('front and sync realtime gateway required handlers are registered by lightweight providers', t => {
  const registry = new RealtimeRegistry();

  new WorkspaceAccessRealtimeProvider(
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new WorkspaceConfigRealtimeProvider(
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new WorkspaceMembersRealtimeProvider(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new DocShareRealtimeProvider(
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new DocGrantsRealtimeProvider(
    {} as never,
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new UserRealtimeProvider({} as never, registry).onModuleInit();
  new NotificationRealtimeProvider({} as never, registry).onModuleInit();
  new CommentRealtimeProvider(
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new CopilotEmbeddingRealtimeProvider(
    {} as never,
    {} as never,
    registry,
    {} as never
  ).onModuleInit();
  new CopilotTranscriptRealtimeProvider(
    {} as never,
    {} as never,
    registry
  ).onModuleInit();
  new QuotaStateRealtimeProvider(
    {} as never,
    {} as never,
    registry
  ).onModuleInit();

  t.deepEqual(
    REALTIME_GATEWAY_REQUIRED_REQUESTS.filter(
      name => !registry.hasRequest(name)
    ),
    []
  );
  t.deepEqual(
    REALTIME_GATEWAY_REQUIRED_TOPICS.filter(name => !registry.hasTopic(name)),
    []
  );
});

test('workspace realtime providers register access, config, members and invite link handlers', async t => {
  const registry = new RealtimeRegistry();
  const assertions: unknown[] = [];
  const ac = {
    user(userId: string) {
      return {
        workspace(workspaceId: string) {
          return {
            async assert(action: string) {
              assertions.push({ userId, workspaceId, action });
            },
            async permissions() {
              return {
                role: WorkspaceRole.Admin,
                permissions: { 'Workspace.Read': true },
              };
            },
          };
        },
      };
    },
  } as unknown as PermissionAccess;
  const models = {
    workspace: {
      get: async () => ({
        enableAi: true,
        enableSharing: false,
        enableUrlPreview: true,
        enableDocEmbedding: false,
      }),
    },
    workspaceUser: {
      search: async () => [],
      paginate: async () => [
        [
          {
            id: 'invite',
            type: WorkspaceRole.Collaborator,
            status: 'Accepted',
            user: {
              id: 'u1',
              name: 'User',
              email: 'u1@affine.pro',
              avatarUrl: null,
            },
          },
        ],
        1,
      ],
      count: async () => 1,
    },
  };
  const quotaState = {
    getWorkspaceQuotaState: async () => ({ known: true, plan: 'team' }),
    reconcileWorkspaceQuotaState: async () => {
      throw new Error('workspace.access.get should not reconcile quota state');
    },
  };
  const cache = {
    get: async () => ({ inviteId: 'invite-link' }),
    ttl: async () => 10,
  };
  const url = {
    link: (path: string) => `https://app.affine.pro${path}`,
  };

  new WorkspaceAccessRealtimeProvider(
    ac,
    quotaState as never,
    registry
  ).onModuleInit();
  new WorkspaceConfigRealtimeProvider(
    ac,
    models as never,
    registry
  ).onModuleInit();
  new WorkspaceMembersRealtimeProvider(
    cache as never,
    url as never,
    ac,
    models as never,
    registry
  ).onModuleInit();

  t.deepEqual(
    await registry.getRequest('workspace.access.get').handle(user, {
      workspaceId: 'space',
    }),
    {
      access: {
        role: 'Admin',
        permissions: { Workspace_Read: true },
        team: true,
      },
    }
  );
  t.deepEqual(
    await registry.getRequest('workspace.config.get').handle(user, {
      workspaceId: 'space',
    }),
    {
      config: {
        enableAi: true,
        enableSharing: false,
        enableUrlPreview: true,
        enableDocEmbedding: false,
      },
    }
  );
  t.like(
    await registry.getRequest('workspace.members.get').handle(user, {
      workspaceId: 'space',
      take: 1000,
    }),
    { memberCount: 1 }
  );
  t.like(
    await registry.getRequest('workspace.invite-link.get').handle(user, {
      workspaceId: 'space',
    }),
    {
      inviteLink: {
        link: 'https://app.affine.pro/invite/invite-link',
      },
    }
  );
  t.is(
    registry
      .getTopic('workspace.access.changed')
      .room(user, { workspaceId: 'space' }),
    realtimeWorkspaceAccessRoom('space')
  );
  t.is(
    registry
      .getTopic('workspace.config.changed')
      .room(user, { workspaceId: 'space' }),
    realtimeWorkspaceConfigRoom('space')
  );
  t.is(
    registry
      .getTopic('workspace.members.changed')
      .room(user, { workspaceId: 'space' }),
    realtimeWorkspaceMembersRoom('space')
  );
  t.is(
    registry
      .getTopic('workspace.invite-link.changed')
      .room(user, { workspaceId: 'space' }),
    realtimeWorkspaceInviteLinkRoom('space')
  );
  t.true(
    assertions.some(
      item =>
        JSON.stringify(item) ===
        JSON.stringify({
          userId: 'u1',
          workspaceId: 'space',
          action: 'Workspace.Users.Read',
        })
    )
  );
});

test('doc realtime providers register share state and grants handlers', async t => {
  const registry = new RealtimeRegistry();
  const assertedActions: string[] = [];
  const ac = {
    user(userId: string) {
      return {
        doc(workspaceId: string, docId: string) {
          return {
            async assert(action: string) {
              t.deepEqual(
                { userId, workspaceId, docId },
                {
                  userId: 'u1',
                  workspaceId: 'space',
                  docId: 'doc',
                }
              );
              assertedActions.push(action);
            },
          };
        },
      };
    },
  } as unknown as PermissionAccess;
  const models = {
    doc: {
      getDocInfo: async () => ({
        public: true,
        mode: PublicDocMode.Page,
        defaultRole: DocRole.Reader,
      }),
    },
    docUser: {
      findDirectGrantDocIdsByUser: async () => [],
      paginate: async () => [
        [
          {
            userId: 'u2',
            type: DocRole.Manager,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        1,
      ],
    },
    user: {
      getWorkspaceUsers: async () => [
        {
          id: 'u2',
          name: 'User 2',
          email: 'u2@affine.pro',
          avatarUrl: null,
        },
      ],
    },
  };

  const grants = {
    paginateGrantedUsers: async () => ({
      totalCount: 1,
      pageInfo: { endCursor: null, hasNextPage: false },
      edges: [
        {
          node: {
            type: DocRole.Manager,
            user: {
              id: 'u2',
              name: 'User 2',
              email: 'u2@affine.pro',
              avatarUrl: null,
            },
          },
        },
      ],
    }),
  };

  new DocShareRealtimeProvider(ac, models as never, registry).onModuleInit();
  new DocGrantsRealtimeProvider(
    ac,
    models as never,
    grants as never,
    registry
  ).onModuleInit();

  t.deepEqual(
    await registry.getRequest('doc.share-state.get').handle(user, {
      workspaceId: 'space',
      docId: 'doc',
    }),
    {
      state: {
        public: true,
        mode: 'Page',
        defaultRole: 'Reader',
      },
    }
  );
  t.like(
    await registry.getRequest('doc.grants.get').handle(user, {
      workspaceId: 'space',
      docId: 'doc',
      pagination: { first: 10 },
    }),
    { totalCount: 1 }
  );
  t.deepEqual(assertedActions, ['Doc.Read', 'Doc.Users.Read']);
  t.is(
    registry
      .getTopic('doc.share-state.changed')
      .room(user, { workspaceId: 'space', docId: 'doc' }),
    realtimeDocShareStateRoom('space', 'doc')
  );
  t.is(
    registry
      .getTopic('doc.grants.changed')
      .room(user, { workspaceId: 'space', docId: 'doc' }),
    realtimeDocGrantsRoom('space', 'doc')
  );
});

test('user realtime provider snapshots private profile settings and access tokens without plaintext token', async t => {
  const registry = new RealtimeRegistry();
  const models = {
    user: {
      get: async () => ({
        id: 'u1',
        name: 'User',
        email: 'u1@affine.pro',
        avatarUrl: null,
        emailVerifiedAt: new Date(0),
        password: 'hash',
        disabled: false,
      }),
    },
    userSettings: {
      get: async () => ({
        receiveInvitationEmail: true,
        receiveMentionEmail: false,
        receiveCommentEmail: true,
      }),
    },
    userFeature: {
      list: async () => ['administrator'],
    },
    accessToken: {
      list: async () => [
        {
          id: 'token',
          name: 'Token',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
        },
      ],
    },
  };

  new UserRealtimeProvider(models as never, registry).onModuleInit();

  t.deepEqual(await registry.getRequest('user.profile.get').handle(user, {}), {
    user: {
      id: 'u1',
      name: 'User',
      email: 'u1@affine.pro',
      emailVerified: true,
      hasPassword: true,
      avatarUrl: null,
      features: ['Admin'],
    },
  });
  t.deepEqual(
    await registry
      .getRequest('user.profile.get')
      .handle(undefined as never, {}),
    { user: null }
  );
  t.is(
    registry.getTopic('user.profile.changed').room(user, {}),
    realtimeUserProfileRoom('u1')
  );
  t.is(
    registry.getTopic('user.settings.changed').room(user, {}),
    realtimeUserSettingsRoom('u1')
  );
  t.is(
    registry.getTopic('user.access-tokens.changed').room(user, {}),
    realtimeUserAccessTokensRoom('u1')
  );
  t.deepEqual(await registry.getRequest('user.settings.get').handle(user, {}), {
    settings: {
      receiveInvitationEmail: true,
      receiveMentionEmail: false,
      receiveCommentEmail: true,
    },
  });
  t.deepEqual(
    await registry.getRequest('user.access-tokens.get').handle(user, {}),
    {
      tokens: [
        {
          id: 'token',
          name: 'Token',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
        },
      ],
    }
  );
});

test('new realtime providers publish changed events from domain events', t => {
  const published: unknown[][] = [];
  const publisher = {
    publish: (...args: unknown[]) => published.push(args),
    publishChanged: (...args: unknown[]) => published.push(args),
  } as unknown as RealtimePublisher;

  const workspaceAccess = new WorkspaceAccessRealtimeProvider(
    {} as never,
    {} as never,
    undefined,
    publisher
  );
  workspaceAccess.onMembersUpdated({ workspaceId: 'space' });

  const workspaceConfig = new WorkspaceConfigRealtimeProvider(
    {} as never,
    {} as never,
    undefined,
    publisher
  );
  workspaceConfig.onWorkspaceUpdated({ id: 'space' } as never);

  const workspaceMembers = new WorkspaceMembersRealtimeProvider(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    publisher
  );
  workspaceMembers.onInviteLinkCreated({ workspaceId: 'space' });

  const docShare = new DocShareRealtimeProvider(
    {} as never,
    {} as never,
    undefined,
    publisher
  );
  docShare.onPublicStateChanged({ workspaceId: 'space', docId: 'doc' });

  const docGrants = new DocGrantsRealtimeProvider(
    {} as never,
    {} as never,
    {} as never,
    undefined,
    publisher
  );
  docGrants.onOwnerChanged({
    workspaceId: 'space',
    docId: 'doc',
    userId: 'u2',
  });

  const userProvider = new UserRealtimeProvider(
    {} as never,
    undefined,
    publisher
  );
  userProvider.onUserAccessTokenCreated({ userId: 'u1' });

  t.deepEqual(
    published.map(args => args[0]),
    [
      'workspace.access.changed',
      'workspace.config.changed',
      'workspace.invite-link.changed',
      'doc.share-state.changed',
      'doc.grants.changed',
      'user.access-tokens.changed',
    ]
  );
});

test('quota realtime provider exposes effective quota state snapshots', async t => {
  const registry = new RealtimeRegistry();
  const provider = new QuotaStateRealtimeProvider(
    {
      workspaceUser: {
        getActive: async () => ({ role: 'admin' }),
      },
    } as never,
    {
      reconcileUserQuotaState: async () => ({
        userId: 'u1',
        plan: 'pro',
        sourceEntitlementId: null,
        blobLimit: 1n,
        storageQuota: 2n,
        usedStorageQuota: 3n,
        historyPeriodSeconds: 4,
        copilotActionLimit: null,
        flags: {},
        known: true,
        stale: false,
        lastReconciledAt: null,
        staleAfter: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }),
      reconcileWorkspaceQuotaState: async () => ({
        workspaceId: 'space',
        plan: 'team',
        sourceEntitlementId: null,
        ownerUserId: 'u1',
        usesOwnerQuota: false,
        seatLimit: 5,
        memberCount: 4,
        overcapacityMemberCount: 0,
        blobLimit: 6n,
        storageQuota: 7n,
        usedStorageQuota: 8n,
        historyPeriodSeconds: 9,
        readonly: false,
        readonlyReasons: [],
        flags: {},
        known: true,
        stale: false,
        lastReconciledAt: null,
        staleAfter: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }),
    } as never,
    registry
  );

  provider.onModuleInit();

  t.deepEqual(
    await registry.getRequest('user.quota-state.get').handle(user, {}),
    {
      state: {
        userId: 'u1',
        plan: 'pro',
        sourceEntitlementId: null,
        blobLimit: 1,
        storageQuota: 2,
        usedStorageQuota: 3,
        historyPeriodSeconds: 4,
        copilotActionLimit: null,
        flags: {},
        known: true,
        stale: false,
        lastReconciledAt: null,
        staleAfter: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    }
  );
  const workspaceQuotaState = (await registry
    .getRequest('workspace.quota-state.get')
    .handle(user, { workspaceId: 'space' })) as {
    state: WorkspaceQuotaStateSnapshot;
  };
  t.is(workspaceQuotaState.state.memberCount, 4);
  t.is(
    registry
      .getTopic('workspace.quota-state.changed')
      .room(user, { workspaceId: 'space' }),
    realtimeWorkspaceQuotaStateRoom('space')
  );
});

test('copilot embedding realtime provider uses lightweight model reads', async t => {
  const registry = new RealtimeRegistry();
  const published: unknown[][] = [];
  const assertions: unknown[] = [];
  const ac = {
    user(userId: string) {
      return {
        workspace(workspaceId: string) {
          return {
            allowLocal() {
              return this;
            },
            async assert(action: string) {
              assertions.push({ userId, workspaceId, action });
            },
          };
        },
      };
    },
  } as unknown as PermissionAccess;
  const models = {
    copilotWorkspace: {
      checkEmbeddingAvailable: async () => true,
      getEmbeddingStatus: async () => ({ total: 5, embedded: 3 }),
    },
    copilotContext: {
      getConfig: async () => ({ workspaceId: 'space' }),
    },
  };
  const publisher = {
    publish: (...args: unknown[]) => published.push(args),
  } as unknown as RealtimePublisher;

  const provider = new CopilotEmbeddingRealtimeProvider(
    ac,
    models as never,
    registry,
    publisher
  );
  provider.onModuleInit();

  t.deepEqual(
    await registry
      .getRequest('workspace.embedding.progress.get')
      .handle(user, { workspaceId: 'space' }),
    {
      total: 5,
      embedded: 3,
    }
  );
  t.is(
    registry
      .getTopic('workspace.embedding.progress.changed')
      .room(user, { workspaceId: 'space' }),
    realtimeWorkspaceEmbeddingProgressRoom('space')
  );

  await provider.onDocEmbedFinished({ contextId: 'context', docId: 'doc' });

  t.deepEqual(assertions, [
    { userId: 'u1', workspaceId: 'space', action: 'Workspace.Copilot' },
  ]);
  t.deepEqual(published[0], [
    'workspace.embedding.progress.changed',
    { workspaceId: 'space' },
    { reason: 'finished' },
    { room: realtimeWorkspaceEmbeddingProgressRoom('space') },
  ]);
});

test('copilot transcript realtime provider registers task live query handlers', async t => {
  const registry = new RealtimeRegistry();
  const assertions: unknown[] = [];
  const ac = {
    user(userId: string) {
      return {
        workspace(workspaceId: string) {
          return {
            allowLocal() {
              return this;
            },
            async assert(action: string) {
              assertions.push({ userId, workspaceId, action });
            },
          };
        },
      };
    },
  } as unknown as PermissionAccess;
  const transcript = {
    async queryTask(
      userId: string,
      workspaceId: string,
      taskId?: string,
      blobId?: string
    ) {
      return { id: taskId ?? blobId, status: 'finished', userId, workspaceId };
    },
  } as unknown as CopilotTranscriptionReader;

  new CopilotTranscriptRealtimeProvider(
    ac,
    transcript,
    registry
  ).onModuleInit();

  t.deepEqual(
    await registry.getRequest('copilot.transcript.task.get').handle(user, {
      workspaceId: 'space',
      taskId: 'task',
    }),
    {
      task: {
        id: 'task',
        status: 'finished',
        userId: 'u1',
        workspaceId: 'space',
      },
    }
  );
  t.deepEqual(assertions, [
    { userId: 'u1', workspaceId: 'space', action: 'Workspace.Copilot' },
  ]);
});

test('publisher emits realtime event with shared input key', t => {
  const registry = new RealtimeRegistry();
  registry.registerTopic({
    name: 'comment.changed',
    input: z.object({ workspaceId: z.string(), docId: z.string() }),
    authorize: async () => {},
    room: (_currentUser, input) =>
      realtimeCommentRoom(input.workspaceId, input.docId),
  });
  const emitted: unknown[] = [];
  const publisher = new RealtimePublisher(registry, {
    broadcast: () => {},
  } as never);
  publisher.attachServer({
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ room, event, payload }),
    }),
  } as never);

  publisher.publishLocal({
    topic: 'comment.changed',
    input: { docId: 'doc', workspaceId: 'space' },
    event: { changed: true },
  });

  t.like(emitted[0], {
    room: 'workspace:space:doc:doc:comment',
    event: 'realtime:event',
    payload: {
      topic: 'comment.changed',
      inputKey: getRealtimeInputKey({ workspaceId: 'space', docId: 'doc' }),
      event: { changed: true },
    },
  });
});

test('gateway removes subscriptions on socket disconnect', async t => {
  const registry = new RealtimeRegistry();
  registry.registerTopic({
    name: 'notification.count.changed',
    input: z.object({}).strict(),
    authorize: async () => {},
    room: () => 'user:u1:notification-count',
  });
  const gateway = createGateway(registry);
  const client = {
    id: 'socket-1',
    join: async () => {},
    leave: async () => {},
  };

  await gateway.onSubscribe(user, client as never, {
    topic: 'notification.count.changed',
    input: {},
    clientVersion: '0.26.0',
  });
  t.is((gateway as any).subscriptions.size, 1);

  gateway.handleDisconnect(client as never);

  t.is((gateway as any).subscriptions.size, 0);
});
