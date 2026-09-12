import { io } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { listenTestApp, startTestApp } from '../helpers/app.js';
import { cookieHeader } from '../helpers/cookies.js';

const CREATE = `mutation createWorkspace {
  createWorkspace { id public createdAt }
}`;

const INVITE = `mutation inviteByEmails($workspaceId: String!, $emails: [String!]!) {
  inviteMembers(workspaceId: $workspaceId, emails: $emails) { email inviteId error }
}`;

const ACCEPT = `mutation acceptInviteByInviteId($workspaceId: String!, $inviteId: String!) {
  acceptInviteById(workspaceId: $workspaceId, inviteId: $inviteId)
}`;

const INVITE_INFO = `query getInviteInfo($inviteId: String!) {
  getInviteInfo(inviteId: $inviteId) {
    status
    workspace { id name avatar }
    user { id name avatarUrl }
    invitee { id name email avatarUrl }
  }
}`;

const MEMBERS = `query members($id: String!) {
  workspace(id: $id) {
    memberCount
    members { id email role status inviteId }
  }
}`;

const LEAVE = `mutation leaveWorkspace($workspaceId: String!) {
  leaveWorkspace(workspaceId: $workspaceId)
}`;

const REVOKE = `mutation revokeMemberPermission($workspaceId: String!, $userId: String!) {
  revokeMember(workspaceId: $workspaceId, userId: $userId)
}`;

const GRANT = `mutation grantWorkspaceTeamMember($workspaceId: String!, $userId: String!, $permission: Permission!) {
  grantMember(workspaceId: $workspaceId, userId: $userId, permission: $permission)
}`;

const LINK = `mutation createInviteLink($workspaceId: String!, $expireTime: WorkspaceInviteLinkExpireTime!) {
  createInviteLink(workspaceId: $workspaceId, expireTime: $expireTime) { link expireTime }
}`;

const REVOKE_LINK = `mutation revokeInviteLink($workspaceId: String!) {
  revokeInviteLink(workspaceId: $workspaceId)
}`;

const PUBLISH = `mutation publishPage($workspaceId: String!, $pageId: String!, $mode: PublicDocMode) {
  publishDoc(workspaceId: $workspaceId, docId: $pageId, mode: $mode) { id mode public }
}`;

const UNPUBLISH = `mutation revokePublicPage($workspaceId: String!, $pageId: String!) {
  revokePublicDoc(workspaceId: $workspaceId, docId: $pageId) { id mode public }
}`;

const COMMENTS = `query listComments($workspaceId: String!, $docId: String!, $pagination: PaginationInput) {
  workspace(id: $workspaceId) {
    comments(docId: $docId, pagination: $pagination) {
      totalCount
      edges { cursor node { id content resolved replies { id content } user { id } } }
      pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
    }
  }
}`;

const CREATE_COMMENT = `mutation createComment($input: CommentCreateInput!) {
  createComment(input: $input) { id content resolved user { id name } replies { id } }
}`;

const UPDATE_COMMENT = `mutation updateComment($input: CommentUpdateInput!) {
  updateComment(input: $input)
}`;

const RESOLVE = `mutation resolveComment($input: CommentResolveInput!) {
  resolveComment(input: $input)
}`;

const DELETE_COMMENT = `mutation deleteComment($id: String!) {
  deleteComment(id: $id)
}`;

const REPLY = `mutation createReply($input: ReplyCreateInput!) {
  createReply(input: $input) { id commentId content }
}`;

async function gql(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  query: string,
  opts: { cookies: string; variables?: Record<string, unknown>; op?: string }
) {
  return app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      cookie: opts.cookies,
      'x-operation-name': opts.op ?? 'op',
    },
    payload: { query, variables: opts.variables ?? {} },
  });
}

async function signIn(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  email: string
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    headers: { 'content-type': 'application/json' },
    payload: { email, password: 'correcthorse' },
  });
  expect(res.statusCode).toBe(200);
  return {
    cookies: cookieHeader(res),
    user: res.json() as { id: string; email: string },
  };
}

async function createWorkspace(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  cookies: string
) {
  const res = await gql(app, CREATE, { cookies, op: 'createWorkspace' });
  const body = res.json() as {
    data: { createWorkspace: { id: string } };
    errors?: unknown;
  };
  expect(body.errors).toBeUndefined();
  return body.data.createWorkspace.id;
}

describe('Phase 4 — Members, sharing, comments', () => {
  it('advertises Comment so the MIT comments UI can turn on', async () => {
    const { app } = await startTestApp();
    const res = await gql(app, `query { serverConfig { features } }`, {
      cookies: '',
      op: 'serverConfig',
    });
    const body = res.json() as {
      data: { serverConfig: { features: string[] } };
    };
    expect(body.data.serverConfig.features).toContain('Comment');
  });

  it('invites by email, accepts, and lets the member list and sync', async () => {
    const { app, url } = await listenTestApp();
    const owner = await signIn(app, 'owner@example.com');
    const workspaceId = await createWorkspace(app, owner.cookies);
    const member = await signIn(app, 'member@example.com');

    const invited = await gql(app, INVITE, {
      cookies: owner.cookies,
      op: 'inviteByEmails',
      variables: { workspaceId, emails: ['member@example.com'] },
    });
    const inviteBody = invited.json() as {
      data: { inviteMembers: Array<{ inviteId: string }> };
      errors?: unknown;
    };
    expect(inviteBody.errors).toBeUndefined();
    const inviteId = inviteBody.data.inviteMembers[0]?.inviteId;
    expect(inviteId).toBeTruthy();

    const info = await gql(app, INVITE_INFO, {
      cookies: member.cookies,
      op: 'getInviteInfo',
      variables: { inviteId },
    });
    expect(info.json()).toMatchObject({
      data: {
        getInviteInfo: {
          status: 'Pending',
          workspace: { id: workspaceId, name: 'Untitled' },
          invitee: { email: 'member@example.com' },
        },
      },
    });

    const accepted = await gql(app, ACCEPT, {
      cookies: member.cookies,
      op: 'acceptInviteByInviteId',
      variables: { workspaceId, inviteId },
    });
    expect(accepted.json()).toMatchObject({ data: { acceptInviteById: true } });

    const listed = await gql(app, MEMBERS, {
      cookies: owner.cookies,
      op: 'members',
      variables: { id: workspaceId },
    });
    const membersBody = listed.json() as {
      data: {
        workspace: {
          memberCount: number;
          members: Array<{ email: string; role: string }>;
        };
      };
    };
    expect(membersBody.data.workspace.memberCount).toBe(2);
    expect(
      membersBody.data.workspace.members.map(item => item.email).sort()
    ).toEqual(['member@example.com', 'owner@example.com']);

    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: member.cookies },
      reconnection: false,
      timeout: 5000,
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const realtime = (await socket
      .timeout(8000)
      .emitWithAck('realtime:request', {
        op: 'workspace.members.get',
        input: { workspaceId, skip: 0, take: 10 },
      })) as { data?: { memberCount: number }; error?: { name: string } };
    expect(realtime.error).toBeUndefined();
    expect(realtime.data?.memberCount).toBe(2);

    const join = (await socket.timeout(8000).emitWithAck('space:join-batch', {
      spaces: [
        { spaceType: 'workspace', spaceId: workspaceId, docId: 'board' },
      ],
    })) as { data?: { success: boolean }; error?: unknown };
    expect(join.data?.success).toBe(true);
    socket.disconnect();
  });

  it('stops delivering realtime:event after realtime:unsubscribe leaves the room', async () => {
    const { app, url } = await listenTestApp();
    const owner = await signIn(app, 'rt-owner@example.com');
    const workspaceId = await createWorkspace(app, owner.cookies);

    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: owner.cookies },
      reconnection: false,
      timeout: 5000,
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });

    const events: unknown[] = [];
    socket.on('realtime:event', event => events.push(event));

    const sub = (await socket.timeout(8000).emitWithAck('realtime:subscribe', {
      topic: 'workspace.members.changed',
      input: { workspaceId },
    })) as { data?: { subscriptionId: string }; error?: unknown };
    expect(sub.error).toBeUndefined();
    const subscriptionId = sub.data?.subscriptionId;
    expect(subscriptionId).toBeTruthy();

    await gql(app, INVITE, {
      cookies: owner.cookies,
      op: 'inviteByEmails',
      variables: { workspaceId, emails: ['rt-member-1@example.com'] },
    });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(events.length).toBeGreaterThan(0);

    const unsub = (await socket
      .timeout(8000)
      .emitWithAck('realtime:unsubscribe', {
        subscriptionId,
      })) as { data?: { ok: true } };
    expect(unsub.data?.ok).toBe(true);

    events.length = 0;
    await gql(app, INVITE, {
      cookies: owner.cookies,
      op: 'inviteByEmails',
      variables: { workspaceId, emails: ['rt-member-2@example.com'] },
    });
    await new Promise(resolve => setTimeout(resolve, 200));
    // Having actually left the Socket.IO room, no further broadcasts for
    // this subscription should reach the socket.
    expect(events).toHaveLength(0);

    socket.disconnect();
  });

  it('rejects collaborator invites and does not seat-lock 10+ members', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner@example.com');
    const workspaceId = await createWorkspace(app, owner.cookies);
    const collab = await signIn(app, 'collab@example.com');
    const invite = await gql(app, INVITE, {
      cookies: owner.cookies,
      op: 'inviteByEmails',
      variables: { workspaceId, emails: ['collab@example.com'] },
    });
    const inviteId = (
      invite.json() as { data: { inviteMembers: Array<{ inviteId: string }> } }
    ).data.inviteMembers[0]?.inviteId;
    await gql(app, ACCEPT, {
      cookies: collab.cookies,
      op: 'acceptInviteByInviteId',
      variables: { workspaceId, inviteId },
    });

    const denied = await gql(app, INVITE, {
      cookies: collab.cookies,
      op: 'inviteByEmails',
      variables: { workspaceId, emails: ['other@example.com'] },
    });
    expect(denied.json()).toMatchObject({
      errors: [{ extensions: { name: 'SPACE_ACCESS_DENIED' } }],
    });

    const emails = Array.from(
      { length: 11 },
      (_, index) => `seat${index}@example.com`
    );
    for (const email of emails) {
      const user = await signIn(app, email);
      const batch = await gql(app, INVITE, {
        cookies: owner.cookies,
        op: 'inviteByEmails',
        variables: { workspaceId, emails: [email] },
      });
      const id = (
        batch.json() as {
          data: {
            inviteMembers: Array<{ inviteId: string | null; error: unknown }>;
          };
        }
      ).data.inviteMembers[0];
      expect(id?.error).toBeNull();
      expect(id?.inviteId).toBeTruthy();
      const accept = await gql(app, ACCEPT, {
        cookies: user.cookies,
        op: 'acceptInviteByInviteId',
        variables: { workspaceId, inviteId: id?.inviteId },
      });
      expect(accept.json().data.acceptInviteById).toBe(true);
    }

    const listed = await gql(app, MEMBERS, {
      cookies: owner.cookies,
      op: 'members',
      variables: { id: workspaceId },
    });
    const count = (
      listed.json() as { data: { workspace: { memberCount: number } } }
    ).data.workspace.memberCount;
    expect(count).toBeGreaterThanOrEqual(13);
  });

  it('supports invite links, grant, revoke, and leave', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner@example.com');
    const admin = await signIn(app, 'admin@example.com');
    const extra = await signIn(app, 'extra@example.com');
    const workspaceId = await createWorkspace(app, owner.cookies);

    const created = await gql(app, LINK, {
      cookies: owner.cookies,
      op: 'createInviteLink',
      variables: { workspaceId, expireTime: 'OneDay' },
    });
    const link = (
      created.json() as { data: { createInviteLink: { link: string } } }
    ).data.createInviteLink.link;
    const token = link.split('/invite/')[1];
    expect(token).toBeTruthy();

    await gql(app, ACCEPT, {
      cookies: admin.cookies,
      op: 'acceptInviteByInviteId',
      variables: { workspaceId, inviteId: token },
    });
    await gql(app, GRANT, {
      cookies: owner.cookies,
      op: 'grantWorkspaceTeamMember',
      variables: { workspaceId, userId: admin.user.id, permission: 'Admin' },
    });
    await gql(app, ACCEPT, {
      cookies: extra.cookies,
      op: 'acceptInviteByInviteId',
      variables: { workspaceId, inviteId: token },
    });

    const revoked = await gql(app, REVOKE, {
      cookies: admin.cookies,
      op: 'revokeMemberPermission',
      variables: { workspaceId, userId: extra.user.id },
    });
    expect(revoked.json()).toMatchObject({ data: { revokeMember: true } });

    const left = await gql(app, LEAVE, {
      cookies: admin.cookies,
      op: 'leaveWorkspace',
      variables: { workspaceId },
    });
    expect(left.json()).toMatchObject({ data: { leaveWorkspace: true } });

    const ownerLeave = await gql(app, LEAVE, {
      cookies: owner.cookies,
      op: 'leaveWorkspace',
      variables: { workspaceId },
    });
    expect(ownerLeave.json()).toMatchObject({
      errors: [{ extensions: { name: 'ACTION_FORBIDDEN' } }],
    });

    const revokedLink = await gql(app, REVOKE_LINK, {
      cookies: owner.cookies,
      op: 'revokeInviteLink',
      variables: { workspaceId },
    });
    expect(revokedLink.json()).toMatchObject({
      data: { revokeInviteLink: true },
    });
  });

  it('publishes a public doc snapshot and hides it after revoke', async () => {
    const { app, url } = await listenTestApp();
    const owner = await signIn(app, 'publisher@example.com');
    const spaceId = await createWorkspace(app, owner.cookies);
    const docId = 'shared-board';

    const ydoc = new YDoc();
    ydoc.getMap('meta').set('title', 'Public board');
    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: owner.cookies },
      reconnection: false,
      timeout: 5000,
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await socket.timeout(8000).emitWithAck('space:join-batch', {
      spaces: [{ spaceType: 'workspace', spaceId, docId }],
    });
    const push = (await socket
      .timeout(8000)
      .emitWithAck('space:push-doc-update', {
        spaceType: 'workspace',
        spaceId,
        docId,
        update: Buffer.from(encodeStateAsUpdate(ydoc)).toString('base64'),
      })) as { data?: { timestamp: number }; error?: unknown };
    expect(push.data?.timestamp).toBeGreaterThan(0);
    socket.disconnect();

    const published = await gql(app, PUBLISH, {
      cookies: owner.cookies,
      op: 'publishPage',
      variables: { workspaceId: spaceId, pageId: docId, mode: 'Page' },
    });
    expect(published.json()).toMatchObject({
      data: { publishDoc: { id: docId, mode: 'Page', public: true } },
    });

    const head = await app.inject({
      method: 'HEAD',
      url: `/api/workspaces/${spaceId}/public-docs/${docId}`,
    });
    expect(head.statusCode).toBe(200);
    expect(head.headers['publish-mode']).toBe('page');

    const get = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/public-docs/${docId}`,
    });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toMatch(/octet-stream/);
    const loaded = new YDoc();
    applyUpdate(loaded, Uint8Array.from(get.rawPayload));
    expect(loaded.getMap('meta').get('title')).toBe('Public board');

    await gql(app, UNPUBLISH, {
      cookies: owner.cookies,
      op: 'revokePublicPage',
      variables: { workspaceId: spaceId, pageId: docId },
    });
    const missing = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/public-docs/${docId}`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ name: 'DOC_NOT_FOUND' });
    expect((missing.json() as { error?: string }).error).not.toBe('not_found');
  });

  it('supports comment CRUD, replies, resolve, and pagination', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner@example.com');
    const workspaceId = await createWorkspace(app, owner.cookies);
    const docId = 'doc-comments';

    const created: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await gql(app, CREATE_COMMENT, {
        cookies: owner.cookies,
        op: 'createComment',
        variables: {
          input: {
            workspaceId,
            docId,
            docMode: 'page',
            docTitle: 'Board',
            content: { text: `c${i}` },
          },
        },
      });
      const id = (res.json() as { data: { createComment: { id: string } } })
        .data.createComment.id;
      created.push(id);
    }

    const first = created[0];
    await gql(app, UPDATE_COMMENT, {
      cookies: owner.cookies,
      op: 'updateComment',
      variables: { input: { id: first, content: { text: 'edited' } } },
    });
    await gql(app, RESOLVE, {
      cookies: owner.cookies,
      op: 'resolveComment',
      variables: { input: { id: first, resolved: true } },
    });
    await gql(app, REPLY, {
      cookies: owner.cookies,
      op: 'createReply',
      variables: {
        input: {
          commentId: first,
          content: { text: 'reply' },
          docMode: 'page',
          docTitle: 'Board',
        },
      },
    });

    const page = await gql(app, COMMENTS, {
      cookies: owner.cookies,
      op: 'listComments',
      variables: { workspaceId, docId, pagination: { first: 2 } },
    });
    const comments = (
      page.json() as {
        data: {
          workspace: {
            comments: {
              totalCount: number;
              pageInfo: { hasNextPage: boolean; endCursor: string };
              edges: Array<{
                node: { id: string; resolved: boolean; replies: unknown[] };
              }>;
            };
          };
        };
      }
    ).data.workspace.comments;
    expect(comments.totalCount).toBe(3);
    expect(comments.edges).toHaveLength(2);
    expect(comments.pageInfo.hasNextPage).toBe(true);
    expect(comments.edges[0]?.node.resolved).toBe(true);
    expect(comments.edges[0]?.node.replies).toHaveLength(1);

    const next = await gql(app, COMMENTS, {
      cookies: owner.cookies,
      op: 'listComments',
      variables: {
        workspaceId,
        docId,
        pagination: { first: 2, after: comments.pageInfo.endCursor },
      },
    });
    const nextPage = (
      next.json() as {
        data: {
          workspace: {
            comments: { edges: unknown[]; pageInfo: { hasNextPage: boolean } };
          };
        };
      }
    ).data.workspace.comments;
    expect(nextPage.edges).toHaveLength(1);
    expect(nextPage.pageInfo.hasNextPage).toBe(false);

    await gql(app, DELETE_COMMENT, {
      cookies: owner.cookies,
      op: 'deleteComment',
      variables: { id: created[2] },
    });
    const afterDelete = await gql(app, COMMENTS, {
      cookies: owner.cookies,
      op: 'listComments',
      variables: { workspaceId, docId, pagination: { first: 10 } },
    });
    expect(
      (
        afterDelete.json() as {
          data: { workspace: { comments: { totalCount: number } } };
        }
      ).data.workspace.comments.totalCount
    ).toBe(2);
  });
});
