import { randomUUID } from 'node:crypto';

import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '..';
import { CommentChangeAction, Reply } from '../comment';

const module = await createModule({});

const models = module.get(Models);
const owner = await module.create(Mockers.User);
const workspace = await module.create(Mockers.Workspace, {
  owner,
});

test.after.always(async () => {
  await module.close();
});

test('should throw error when content is null', async t => {
  const docId = randomUUID();
  await t.throwsAsync(
    models.comment.create({
      // @ts-expect-error test null content
      content: null,
      workspaceId: workspace.id,
      docId,
      userId: owner.id,
    }),
    {
      message: /Expected object, received null/,
    }
  );

  await t.throwsAsync(
    models.comment.createReply({
      // @ts-expect-error test null content
      content: null,
      commentId: randomUUID(),
    }),
    {
      message: /Expected object, received null/,
    }
  );
});

test('should create a comment', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });
  t.is(comment.createdAt.getTime(), comment.updatedAt.getTime());
  t.is(comment.deletedAt, null);
  t.is(comment.resolved, false);
  t.deepEqual(comment.content, {
    type: 'paragraph',
    content: [{ type: 'text', text: 'test' }],
  });
});

test('should get a comment', async t => {
  const docId = randomUUID();
  const comment1 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const comment2 = await models.comment.get(comment1.id);
  t.deepEqual(comment2, comment1);
  t.deepEqual(comment2?.content, {
    type: 'paragraph',
    content: [{ type: 'text', text: 'test' }],
  });
});

test('should update a comment', async t => {
  const docId = randomUUID();
  const comment1 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const comment2 = await models.comment.update({
    id: comment1.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test2' }],
    },
  });
  t.deepEqual(comment2.content, {
    type: 'paragraph',
    content: [{ type: 'text', text: 'test2' }],
  });
  // updatedAt should be changed
  t.true(comment2.updatedAt.getTime() > comment2.createdAt.getTime());

  const comment3 = await models.comment.get(comment1.id);
  t.deepEqual(comment3, comment2);
});

test('should delete a comment', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  await models.comment.delete(comment.id);

  const comment2 = await models.comment.get(comment.id);

  t.is(comment2, null);
});

test('should resolve a comment', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const comment2 = await models.comment.resolve({
    id: comment.id,
    resolved: true,
  });
  t.is(comment2.resolved, true);

  const comment3 = await models.comment.get(comment.id);
  t.is(comment3!.resolved, true);
  // updatedAt should be changed
  t.true(comment3!.updatedAt.getTime() > comment3!.createdAt.getTime());

  const comment4 = await models.comment.resolve({
    id: comment.id,
    resolved: false,
  });

  t.is(comment4.resolved, false);

  const comment5 = await models.comment.get(comment.id);
  t.is(comment5!.resolved, false);
  // updatedAt should be changed
  t.true(comment5!.updatedAt.getTime() > comment3!.updatedAt.getTime());
});

test('should count comments', async t => {
  const docId = randomUUID();
  const comment1 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const count = await models.comment.count(workspace.id, docId);
  t.is(count, 1);

  await models.comment.delete(comment1.id);
  const count2 = await models.comment.count(workspace.id, docId);
  t.is(count2, 0);
});

test('should create and get a reply', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const reply = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply' }],
    },
    commentId: comment.id,
  });

  t.snapshot(reply.content);
  t.is(reply.commentId, comment.id);
  t.is(reply.userId, owner.id);
  t.is(reply.workspaceId, workspace.id);
  t.is(reply.docId, docId);

  const reply2 = await models.comment.getReply(reply.id);
  t.deepEqual(reply2, reply);
});

test('should throw error reply on a deleted comment', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  await models.comment.delete(comment.id);

  await t.throwsAsync(
    models.comment.createReply({
      userId: owner.id,
      content: {
        type: 'paragraph',
        content: [{ type: 'text', text: 'test reply' }],
      },
      commentId: comment.id,
    }),
    {
      message: /Comment not found/,
    }
  );
});

test('should update a reply', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const reply = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply' }],
    },
    commentId: comment.id,
  });

  const reply2 = await models.comment.updateReply({
    id: reply.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2' }],
    },
  });

  t.snapshot(reply2.content);
  t.true(reply2.updatedAt.getTime() > reply2.createdAt.getTime());
});

test('should delete a reply', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const reply = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply' }],
    },
    commentId: comment.id,
  });

  await models.comment.deleteReply(reply.id);
  const reply2 = await models.comment.getReply(reply.id);
  t.is(reply2, null);
});

test('should list comments with replies', async t => {
  const docId = randomUUID();
  const comment1 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const comment2 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test2' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const comment3 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test3' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const reply1 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply1' }],
    },
    commentId: comment1.id,
  });

  const reply2 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2' }],
    },
    commentId: comment1.id,
  });

  const reply3 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply3' }],
    },
    commentId: comment1.id,
  });

  const reply4 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply4' }],
    },
    commentId: comment2.id,
  });

  const comments = await models.comment.list(workspace.id, docId);
  t.is(comments.length, 3);
  t.is(comments[0].id, comment3.id);
  t.is(comments[1].id, comment2.id);
  t.is(comments[2].id, comment1.id);
  t.is(comments[0].replies.length, 0);
  t.is(comments[1].replies.length, 1);
  t.is(comments[2].replies.length, 3);

  t.is(comments[1].replies[0].id, reply4.id);
  t.is(comments[2].replies[0].id, reply1.id);
  t.is(comments[2].replies[1].id, reply2.id);
  t.is(comments[2].replies[2].id, reply3.id);

  // list with sid
  const comments2 = await models.comment.list(workspace.id, docId, {
    sid: comment2.sid,
  });
  t.is(comments2.length, 1);
  t.is(comments2[0].id, comment1.id);
  t.is(comments2[0].replies.length, 3);

  // ignore deleted comments
  await models.comment.delete(comment1.id);
  const comments3 = await models.comment.list(workspace.id, docId);
  t.is(comments3.length, 2);
  t.is(comments3[0].id, comment3.id);
  t.is(comments3[1].id, comment2.id);
  t.is(comments3[0].replies.length, 0);
  t.is(comments3[1].replies.length, 1);
});

test('should list changes', async t => {
  const docId = randomUUID();
  const comment1 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const comment2 = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test2' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const reply1 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply1' }],
    },
    commentId: comment1.id,
  });

  const reply2 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2' }],
    },
    commentId: comment1.id,
  });

  // all changes
  const changes1 = await models.comment.listChanges(workspace.id, docId);
  t.is(changes1.length, 4);
  t.is(changes1[0].action, CommentChangeAction.update);
  t.is(changes1[0].id, comment1.id);
  t.is(changes1[1].action, CommentChangeAction.update);
  t.is(changes1[1].id, comment2.id);
  t.is(changes1[2].action, CommentChangeAction.update);
  t.is(changes1[2].id, reply1.id);
  t.is(changes1[3].action, CommentChangeAction.update);
  t.is(changes1[3].id, reply2.id);
  // reply has commentId
  t.is((changes1[2].item as Reply).commentId, comment1.id);

  const changes2 = await models.comment.listChanges(workspace.id, docId, {
    commentUpdatedAt: comment1.updatedAt,
    replyUpdatedAt: reply1.updatedAt,
  });
  t.is(changes2.length, 2);
  t.is(changes2[0].action, CommentChangeAction.update);
  t.is(changes2[0].id, comment2.id);
  t.is(changes2[1].action, CommentChangeAction.update);
  t.is(changes2[1].id, reply2.id);
  t.is(changes2[1].commentId, comment1.id);

  // update comment1
  const comment1Updated = await models.comment.update({
    id: comment1.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test3' }],
    },
  });

  const changes3 = await models.comment.listChanges(workspace.id, docId, {
    commentUpdatedAt: comment2.updatedAt,
    replyUpdatedAt: reply2.updatedAt,
  });
  t.is(changes3.length, 1);
  t.is(changes3[0].action, CommentChangeAction.update);
  t.is(changes3[0].id, comment1Updated.id);

  // delete comment1 and reply1, update reply2
  await models.comment.delete(comment1.id);
  await models.comment.deleteReply(reply1.id);
  await models.comment.updateReply({
    id: reply2.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2 updated' }],
    },
  });

  const changes4 = await models.comment.listChanges(workspace.id, docId, {
    commentUpdatedAt: comment1Updated.updatedAt,
    replyUpdatedAt: reply2.updatedAt,
  });
  t.is(changes4.length, 3);
  t.is(changes4[0].action, CommentChangeAction.delete);
  t.is(changes4[0].id, comment1.id);
  t.is(changes4[1].action, CommentChangeAction.delete);
  t.is(changes4[1].id, reply1.id);
  t.is(changes4[1].commentId, comment1.id);
  t.is(changes4[2].action, CommentChangeAction.update);
  t.is(changes4[2].id, reply2.id);
  t.is(changes4[2].commentId, comment1.id);

  // no changes
  const changes5 = await models.comment.listChanges(workspace.id, docId, {
    commentUpdatedAt: changes4[2].item.updatedAt,
    replyUpdatedAt: changes4[2].item.updatedAt,
  });
  t.is(changes5.length, 0);
});

test('should list replies', async t => {
  const docId = randomUUID();
  const comment = await models.comment.create({
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const reply1 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply1' }],
    },
    commentId: comment.id,
  });

  const reply2 = await models.comment.createReply({
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2' }],
    },
    commentId: comment.id,
  });

  const replies = await models.comment.listReplies(
    workspace.id,
    docId,
    comment.id
  );
  t.is(replies.length, 2);
  t.is(replies[0].id, reply1.id);
  t.is(replies[1].id, reply2.id);
});
