import { randomUUID } from 'node:crypto';

import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Comment, CommentChangeAction } from '../../../models';
import { CommentModule } from '..';
import { CommentService } from '../service';

const module = await createModule({
  imports: [CommentModule],
});

const commentService = module.get(CommentService);
const owner = await module.create(Mockers.User);
const workspace = await module.create(Mockers.Workspace, {
  owner,
});
const member = await module.create(Mockers.User);
await module.create(Mockers.WorkspaceUser, {
  workspaceId: workspace.id,
  userId: member.id,
});

test.after.always(async () => {
  await module.close();
});

test('should create a comment', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  t.truthy(comment);
});

test('should update a comment', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });
  const updatedComment = await commentService.updateComment({
    id: comment.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test2' }],
    },
  });

  t.snapshot(updatedComment.content);
});

test('should delete a comment', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });
  await commentService.deleteComment(comment.id);
  const deletedComment = await commentService.getComment(comment.id);

  t.is(deletedComment, null);
});

test('should resolve a comment', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  const resolvedComment = await commentService.resolveComment({
    id: comment.id,
    resolved: true,
  });

  t.is(resolvedComment.resolved, true);

  // unresolved
  const unresolvedComment = await commentService.resolveComment({
    id: comment.id,
    resolved: false,
  });

  t.is(unresolvedComment.resolved, false);
});

test('should create a reply', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  const reply = await commentService.createReply({
    commentId: comment.id,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  t.truthy(reply);
});

test('should update a reply', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  const reply = await commentService.createReply({
    commentId: comment.id,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  const updatedReply = await commentService.updateReply({
    id: reply.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test2' }],
    },
  });

  t.snapshot(updatedReply.content);
});

test('should delete a reply', async t => {
  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId: randomUUID(),
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  const reply = await commentService.createReply({
    commentId: comment.id,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  await commentService.deleteReply(reply.id);
  const deletedReply = await commentService.getReply(reply.id);

  t.is(deletedReply, null);
});

test('should list comments', async t => {
  const docId = randomUUID();
  // empty comments
  let comments = await commentService.listComments(workspace.id, docId, {
    take: 2,
  });

  t.is(comments.length, 0);

  const comment0 = await commentService.createComment({
    workspaceId: workspace.id,
    docId,
    userId: member.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test0' }],
    },
  });

  const comment1 = await commentService.createComment({
    workspaceId: workspace.id,
    docId,
    userId: member.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  const comment2 = await commentService.createComment({
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test2' }],
    },
  });

  const reply1 = await commentService.createReply({
    commentId: comment2.id,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply' }],
    },
  });

  const reply2 = await commentService.createReply({
    commentId: comment2.id,
    userId: member.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2' }],
    },
  });

  const reply3 = await commentService.createReply({
    commentId: comment0.id,
    userId: member.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply3' }],
    },
  });

  // order by sid desc
  comments = await commentService.listComments(workspace.id, docId, {
    take: 2,
  });

  t.is(comments.length, 2);
  t.is(comments[0].id, comment2.id);
  t.is(comments[0].user.id, owner.id);
  // replies order by sid asc
  t.is(comments[0].replies.length, 2);
  t.is(comments[0].replies[0].id, reply1.id);
  t.is(comments[0].replies[0].user.id, owner.id);
  t.is(comments[0].replies[1].id, reply2.id);
  t.is(comments[0].replies[1].user.id, member.id);

  t.is(comments[1].id, comment1.id);
  t.is(comments[1].user.id, member.id);
  t.is(comments[1].replies.length, 0);

  // next page
  const comments2 = await commentService.listComments(workspace.id, docId, {
    take: 2,
    sid: comments[1].sid,
  });

  t.is(comments2.length, 1);
  t.is(comments2[0].id, comment0.id);
  t.is(comments2[0].user.id, member.id);
  t.is(comments2[0].replies.length, 1);
  t.is(comments2[0].replies[0].id, reply3.id);
  t.is(comments2[0].replies[0].user.id, member.id);

  // no more comments
  const comments3 = await commentService.listComments(workspace.id, docId, {
    take: 2,
    sid: comments2[0].sid,
  });

  t.is(comments3.length, 0);
});

test('should list comment changes from scratch', async t => {
  const docId = randomUUID();
  let changes = await commentService.listCommentChanges(workspace.id, docId, {
    take: 2,
  });

  t.is(changes.length, 0);
  let commentUpdatedAt: Date | undefined;
  let replyUpdatedAt: Date | undefined;

  const comment = await commentService.createComment({
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test' }],
    },
  });

  changes = await commentService.listCommentChanges(workspace.id, docId, {
    commentUpdatedAt,
    replyUpdatedAt,
  });

  t.is(changes.length, 1);
  t.is(changes[0].action, CommentChangeAction.update);
  t.is(changes[0].id, comment.id);
  t.deepEqual(changes[0].item, comment);

  commentUpdatedAt = changes[0].item.updatedAt;

  // 2 new replies, 1 new comment and update it, 3 changes
  const reply1 = await commentService.createReply({
    commentId: comment.id,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply1' }],
    },
  });

  const reply2 = await commentService.createReply({
    commentId: comment.id,
    userId: member.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test reply2' }],
    },
  });

  const comment2 = await commentService.createComment({
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
    content: {
      type: 'paragraph',
      content: [{ type: 'text', text: 'test comment2' }],
    },
  });

  const updateContent = {
    type: 'paragraph',
    content: [{ type: 'text', text: 'test comment2 update' }],
  };
  await commentService.updateComment({
    id: comment2.id,
    content: updateContent,
  });

  changes = await commentService.listCommentChanges(workspace.id, docId, {
    commentUpdatedAt,
    replyUpdatedAt,
  });

  t.is(changes.length, 3);
  t.is(changes[0].action, CommentChangeAction.update);
  t.is(changes[0].id, comment2.id);
  t.deepEqual((changes[0].item as Comment).content, updateContent);
  t.is(changes[1].action, CommentChangeAction.update);
  t.is(changes[1].id, reply1.id);
  t.is(changes[1].commentId, comment.id);
  t.deepEqual(changes[1].item, reply1);
  t.is(changes[2].action, CommentChangeAction.update);
  t.is(changes[2].id, reply2.id);
  t.is(changes[2].commentId, comment.id);
  t.deepEqual(changes[2].item, reply2);

  commentUpdatedAt = changes[0].item.updatedAt;
  replyUpdatedAt = changes[2].item.updatedAt;

  // delete comment2 and reply1, 2 changes
  await commentService.deleteComment(comment2.id);
  await commentService.deleteReply(reply1.id);

  changes = await commentService.listCommentChanges(workspace.id, docId, {
    commentUpdatedAt,
    replyUpdatedAt,
  });

  t.is(changes.length, 2);
  t.is(changes[0].action, CommentChangeAction.delete);
  t.is(changes[0].id, comment2.id);
  t.is(changes[1].action, CommentChangeAction.delete);
  t.is(changes[1].id, reply1.id);

  commentUpdatedAt = changes[0].item.updatedAt;
  replyUpdatedAt = changes[1].item.updatedAt;

  // no changes
  changes = await commentService.listCommentChanges(workspace.id, docId, {
    commentUpdatedAt,
    replyUpdatedAt,
  });

  t.is(changes.length, 0);
});
