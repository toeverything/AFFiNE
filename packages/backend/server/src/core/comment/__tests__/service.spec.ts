import test from 'ava';
import Sinon from 'sinon';

import { CommentService } from '../service';

const content = {
  type: 'paragraph',
  content: [{ type: 'text', text: 'test' }],
};
const createdAt = '2026-08-30T00:00:00.000Z';
const updatedAt = '2026-08-30T00:01:00.000Z';
const notification = {
  docTitle: 'Document',
  docMode: 'page',
  mentions: ['mentioned'],
};

test('CommentService maps mutation commands and native dates', async t => {
  const executeDomainCommandV1 = Sinon.stub().callsFake(async input => ({
    id: 'item',
    workspaceId: 'workspace',
    docId: 'doc',
    commentId: 'comment',
    userId: 'user',
    content: input.content ?? content,
    resolved: input.resolved ?? false,
    createdAt,
    updatedAt,
    ...(input.command.startsWith('delete_') ? { deletedAt: updatedAt } : {}),
  }));
  const service = new CommentService(
    {
      user: {
        getPublicUser: async () => ({ id: 'user', name: 'User' }),
      },
    } as never,
    { executeDomainCommandV1 } as never
  );

  for (const { name, expected, invoke, fillsUser } of [
    {
      name: 'create comment',
      expected: {
        command: 'create_comment',
        actorUserId: 'actor',
        workspaceId: 'workspace',
        docId: 'doc',
        content,
        ...notification,
      },
      invoke: () =>
        service.createComment('actor', {
          workspaceId: 'workspace',
          docId: 'doc',
          content,
          ...notification,
        }),
      fillsUser: true,
    },
    {
      name: 'update comment',
      expected: {
        command: 'update_comment',
        actorUserId: 'actor',
        id: 'comment',
        content,
      },
      invoke: () => service.updateComment('actor', { id: 'comment', content }),
      fillsUser: false,
    },
    {
      name: 'resolve comment',
      expected: {
        command: 'resolve_comment',
        actorUserId: 'actor',
        id: 'comment',
        resolved: true,
      },
      invoke: () =>
        service.resolveComment('actor', { id: 'comment', resolved: true }),
      fillsUser: false,
    },
    {
      name: 'delete comment',
      expected: {
        command: 'delete_comment',
        actorUserId: 'actor',
        id: 'comment',
      },
      invoke: () => service.deleteComment('actor', 'comment'),
      fillsUser: false,
    },
    {
      name: 'create reply',
      expected: {
        command: 'create_reply',
        actorUserId: 'actor',
        commentId: 'comment',
        content,
        ...notification,
      },
      invoke: () =>
        service.createReply('actor', {
          commentId: 'comment',
          content,
          ...notification,
        }),
      fillsUser: true,
    },
    {
      name: 'update reply',
      expected: {
        command: 'update_reply',
        actorUserId: 'actor',
        id: 'reply',
        content,
      },
      invoke: () => service.updateReply('actor', { id: 'reply', content }),
      fillsUser: false,
    },
    {
      name: 'delete reply',
      expected: {
        command: 'delete_reply',
        actorUserId: 'actor',
        id: 'reply',
      },
      invoke: () => service.deleteReply('actor', 'reply'),
      fillsUser: false,
    },
  ] as const) {
    const output = await invoke();
    t.deepEqual(executeDomainCommandV1.lastCall.args[0], expected, name);
    t.true(output.createdAt instanceof Date, name);
    t.true(output.updatedAt instanceof Date, name);
    if ('deletedAt' in output) t.true(output.deletedAt instanceof Date, name);
    if (fillsUser) {
      t.deepEqual(
        (output as { user?: unknown }).user,
        { id: 'user', name: 'User' },
        name
      );
    }
  }
});

test('CommentService propagates native mutation failures', async t => {
  const service = new CommentService(
    {} as never,
    {
      executeDomainCommandV1: Sinon.stub().rejects(
        new Error('comment_mutation_denied')
      ),
    } as never
  );

  await t.throwsAsync(
    service.updateComment('actor', { id: 'comment', content }),
    { message: 'comment_mutation_denied' }
  );
});

test('CommentService projects users for comment reads', async t => {
  const now = new Date(createdAt);
  const comment = {
    id: 'comment',
    sid: 1,
    workspaceId: 'workspace',
    docId: 'doc',
    userId: 'commenter',
    content,
    resolved: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    replies: [
      {
        id: 'reply',
        sid: 2,
        workspaceId: 'workspace',
        docId: 'doc',
        commentId: 'comment',
        userId: 'replier',
        content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
  };
  const deletedAt = new Date(updatedAt);
  const models = {
    comment: {
      list: Sinon.stub().resolves([comment]),
      listChanges: Sinon.stub().resolves([
        { action: 'update', id: 'comment', item: comment },
        {
          action: 'delete',
          id: 'deleted',
          item: { deletedAt, updatedAt: deletedAt },
        },
      ]),
    },
    user: {
      getPublicUsersMap: async () =>
        new Map([
          ['commenter', { id: 'commenter' }],
          ['replier', { id: 'replier' }],
        ]),
    },
  };
  const service = new CommentService(models as never, {} as never);

  const comments = await service.listComments('workspace', 'doc');
  t.deepEqual(comments[0].user, { id: 'commenter' });
  t.deepEqual(comments[0].replies[0].user, { id: 'replier' });

  const changes = await service.listCommentChanges('workspace', 'doc', {});
  t.deepEqual((changes[0].item as { user?: unknown }).user, {
    id: 'commenter',
  });
  t.false('user' in changes[1].item);
});
