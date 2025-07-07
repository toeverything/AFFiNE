import { randomUUID } from 'node:crypto';

import {
  CommentChangeAction,
  createCommentMutation,
  createReplyMutation,
  deleteCommentMutation,
  deleteReplyMutation,
  DocMode,
  listCommentChangesQuery,
  listCommentsQuery,
  resolveCommentMutation,
  updateCommentMutation,
  updateReplyMutation,
} from '@affine/graphql';

import { DocRole } from '../../../models';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

async function init() {
  const other = await app.create(Mockers.User);
  const member = await app.create(Mockers.User);
  const owner = await app.create(Mockers.User);

  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });

  const teamWorkspace = await app.create(Mockers.Workspace, {
    owner,
  });
  await app.create(Mockers.TeamWorkspace, {
    id: teamWorkspace.id,
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: teamWorkspace.id,
    userId: member.id,
  });

  return {
    other,
    member,
    owner,
    workspace,
    teamWorkspace,
  };
}

const { owner, workspace, member, other, teamWorkspace } = await init();

// #region comment

e2e('should create comment work', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const result = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });
  t.truthy(result.createComment.id);
  t.false(result.createComment.resolved);
  t.is(result.createComment.replies.length, 0);

  await app.login(member);
  const result2 = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });
  t.truthy(result2.createComment.id);
  t.false(result2.createComment.resolved);
  t.is(result2.createComment.replies.length, 0);
});

e2e('should create comment with mentions work', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Owner,
  });

  await app.login(member);

  const count = app.queue.count('notification.sendComment');
  const result = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
        mentions: [
          // send
          owner.id,
          // ignore doc owner himself
          member.id,
          // ignore not workspace member
          other.id,
        ],
      },
    },
  });

  t.truthy(result.createComment.id);
  t.false(result.createComment.resolved);
  t.is(result.createComment.replies.length, 0);
  // only send one notification to owner
  t.is(app.queue.count('notification.sendComment'), count + 1);
  const notification = app.queue.last('notification.sendComment');
  t.is(notification.name, 'notification.sendComment');
  t.is(notification.payload.userId, owner.id);
});

e2e('should create comment work when user is Commenter', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Commenter,
  });

  await app.login(member);
  const result = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });
  t.truthy(result.createComment.id);
  t.false(result.createComment.resolved);
  t.is(result.createComment.replies.length, 0);
});

e2e('should create comment failed when user is not member', async t => {
  const docId = randomUUID();

  await app.login(other);

  await t.throwsAsync(
    app.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Create action on doc/,
    }
  );
});

e2e('should create comment failed when user is Reader', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Reader,
  });

  await app.login(member);

  await t.throwsAsync(
    app.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: teamWorkspace.id,
          docId,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Create action on doc/,
    }
  );
});

e2e('should update comment work', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: updateCommentMutation,
    variables: {
      input: {
        id: createResult.createComment.id,
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test update' }],
        },
      },
    },
  });

  t.truthy(result.updateComment);
});

e2e('should update comment failed by another user', async t => {
  const docId = randomUUID();

  await app.login(owner);

  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  await app.login(member);

  await t.throwsAsync(
    app.gql({
      query: updateCommentMutation,
      variables: {
        input: {
          id: createResult.createComment.id,
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test update' }],
          },
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Update action on doc/,
    }
  );
});

e2e('should update comment failed when comment not found', async t => {
  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: updateCommentMutation,
      variables: {
        input: {
          id: 'not-found',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message: /Comment not found/,
    }
  );
});

e2e('should resolve comment work', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: resolveCommentMutation,
    variables: {
      input: {
        id: createResult.createComment.id,
        resolved: true,
      },
    },
  });

  t.truthy(result.resolveComment);

  // unresolved
  const result2 = await app.gql({
    query: resolveCommentMutation,
    variables: {
      input: {
        id: createResult.createComment.id,
        resolved: false,
      },
    },
  });

  t.truthy(result2.resolveComment);

  // resolve by doc editor
  await app.login(member);
  const result3 = await app.gql({
    query: resolveCommentMutation,
    variables: {
      input: {
        id: createResult.createComment.id,
        resolved: true,
      },
    },
  });

  t.truthy(result3.resolveComment);
});

e2e('should resolve comment work by doc Commenter himself', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Commenter,
  });

  await app.login(member);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: resolveCommentMutation,
    variables: {
      input: {
        id: createResult.createComment.id,
        resolved: true,
      },
    },
  });

  t.truthy(result.resolveComment);
});

e2e('should resolve comment failed by doc Reader user', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Reader,
  });

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  await app.login(member);
  await t.throwsAsync(
    app.gql({
      query: resolveCommentMutation,
      variables: {
        input: {
          id: createResult.createComment.id,
          resolved: true,
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Resolve action on doc/,
    }
  );
});

e2e('should resolve comment failed when comment not found', async t => {
  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: resolveCommentMutation,
      variables: {
        input: {
          id: 'not-found',
          resolved: true,
        },
      },
    }),
    {
      message: /Comment not found/,
    }
  );
});

e2e('should delete comment work', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: deleteCommentMutation,
    variables: {
      id: createResult.createComment.id,
    },
  });

  t.truthy(result.deleteComment);
});

// #endregion

// #region reply

e2e('should create reply work', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  t.truthy(result.createReply.id);
  t.is(result.createReply.commentId, createResult.createComment.id);
});

e2e('should create reply with mentions work', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Owner,
  });

  await app.login(member);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const count = app.queue.count('notification.sendComment');
  const result = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
        mentions: [
          // send
          owner.id,
          // ignore doc owner himself
          member.id,
          // ignore not workspace member
          other.id,
        ],
      },
    },
  });

  t.truthy(result.createReply.id);
  t.is(result.createReply.commentId, createResult.createComment.id);
  // only send one notification to owner
  t.is(app.queue.count('notification.sendComment'), count + 1);
  const notification = app.queue.last('notification.sendComment');
  t.is(notification.name, 'notification.sendComment');
  t.is(notification.payload.userId, owner.id);
  t.is(notification.payload.body.replyId, result.createReply.id);
  t.is(notification.payload.isMention, true);
});

e2e(
  'should create reply and send comment notification to doc owner',
  async t => {
    const docId = randomUUID();
    await app.create(Mockers.DocUser, {
      workspaceId: teamWorkspace.id,
      docId,
      userId: member.id,
      type: DocRole.Owner,
    });

    await app.login(owner);
    const createResult = await app.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: teamWorkspace.id,
          docId,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    const count = app.queue.count('notification.sendComment');
    const result = await app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    t.truthy(result.createReply.id);
    t.is(result.createReply.commentId, createResult.createComment.id);
    t.is(app.queue.count('notification.sendComment'), count + 1);
    const notification = app.queue.last('notification.sendComment');
    t.is(notification.name, 'notification.sendComment');
    t.is(notification.payload.userId, member.id);
    t.is(notification.payload.body.replyId, result.createReply.id);
    t.is(notification.payload.isMention, undefined);
  }
);

e2e(
  'should create reply and send comment notification to comment author',
  async t => {
    const docId = randomUUID();
    await app.create(Mockers.DocUser, {
      workspaceId: teamWorkspace.id,
      docId,
      userId: owner.id,
      type: DocRole.Owner,
    });

    await app.login(member);
    const createResult = await app.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: teamWorkspace.id,
          docId,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    // owner login to create reply and send notification to comment author: member
    await app.login(owner);
    const count = app.queue.count('notification.sendComment');
    const result = await app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    t.truthy(result.createReply.id);
    t.is(result.createReply.commentId, createResult.createComment.id);
    t.is(app.queue.count('notification.sendComment'), count + 1);
    const notification = app.queue.last('notification.sendComment');
    t.is(notification.name, 'notification.sendComment');
    t.is(notification.payload.userId, member.id);
    t.is(notification.payload.body.replyId, result.createReply.id);
    t.is(notification.payload.isMention, undefined);
  }
);

e2e(
  'should create reply and send comment notification to comment author only when author is doc owner',
  async t => {
    const docId = randomUUID();
    await app.create(Mockers.DocUser, {
      workspaceId: teamWorkspace.id,
      docId,
      userId: member.id,
      type: DocRole.Owner,
    });

    await app.login(member);
    const createResult = await app.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: teamWorkspace.id,
          docId,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    await app.login(owner);
    const count = app.queue.count('notification.sendComment');
    const result = await app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    t.truthy(result.createReply.id);
    t.is(result.createReply.commentId, createResult.createComment.id);
    t.is(app.queue.count('notification.sendComment'), count + 1);
    const notification = app.queue.last('notification.sendComment');
    t.is(notification.name, 'notification.sendComment');
    t.is(notification.payload.userId, member.id);
    t.is(notification.payload.body.replyId, result.createReply.id);
    t.is(notification.payload.isMention, undefined);
  }
);

e2e('should send comment mention notification is high priority', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Owner,
  });

  await app.login(member);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  await app.login(owner);
  const count = app.queue.count('notification.sendComment');
  const result = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
        mentions: [member.id],
      },
    },
  });

  t.truthy(result.createReply.id);
  t.is(result.createReply.commentId, createResult.createComment.id);
  t.is(app.queue.count('notification.sendComment'), count + 1);
  const notification = app.queue.last('notification.sendComment');
  t.is(notification.name, 'notification.sendComment');
  t.is(notification.payload.userId, member.id);
  t.is(notification.payload.body.replyId, result.createReply.id);
  t.is(notification.payload.isMention, true);
});

e2e(
  'should create reply and send comment notification to all repliers',
  async t => {
    const docId = randomUUID();
    await app.create(Mockers.DocUser, {
      workspaceId: teamWorkspace.id,
      docId,
      userId: member.id,
      type: DocRole.Owner,
    });
    await app.create(Mockers.DocUser, {
      workspaceId: teamWorkspace.id,
      docId,
      userId: other.id,
      type: DocRole.Commenter,
    });

    await app.login(member);
    const createResult = await app.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: teamWorkspace.id,
          docId,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    await app.login(owner);
    await app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    // notify to all repliers: member and owner
    const count = app.queue.count('notification.sendComment');
    await app.login(other);
    const result = await app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    });

    t.truthy(result.createReply.id);
    t.is(result.createReply.commentId, createResult.createComment.id);
    t.is(app.queue.count('notification.sendComment'), count + 2);
    const notification = app.queue.last('notification.sendComment');
    t.is(notification.name, 'notification.sendComment');
    t.is(notification.payload.userId, owner.id);
    t.is(notification.payload.body.replyId, result.createReply.id);
    t.is(notification.payload.isMention, undefined);
  }
);

e2e('should create reply work when user is Commenter', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Commenter,
  });

  await app.login(member);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  t.truthy(result.createReply.id);
  t.is(result.createReply.commentId, createResult.createComment.id);
});

e2e('should create reply failed when comment not found', async t => {
  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: 'not-found',
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message: /Comment not found/,
    }
  );
});

e2e('should create reply failed when user is not member', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  await app.login(other);
  await t.throwsAsync(
    app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Create action on doc/,
    }
  );
});

e2e('should create reply failed when user is Reader', async t => {
  const docId = randomUUID();

  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Reader,
  });

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  await app.login(member);
  await t.throwsAsync(
    app.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId: createResult.createComment.id,
          docMode: DocMode.page,
          docTitle: 'test',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Create action on doc/,
    }
  );
});

e2e('should update reply work when user is reply owner', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const createReplyResult = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: updateReplyMutation,
    variables: {
      input: {
        id: createReplyResult.createReply.id,
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test update' }],
        },
      },
    },
  });

  t.truthy(result.updateReply);
});

e2e('should update reply failed when user is not reply owner', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const createReplyResult = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  await app.login(member);
  await t.throwsAsync(
    app.gql({
      query: updateReplyMutation,
      variables: {
        input: {
          id: createReplyResult.createReply.id,
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test update' }],
          },
        },
      },
    }),
    {
      message:
        /You do not have permission to perform Doc\.Comments\.Update action on doc/,
    }
  );
});

e2e('should update reply failed when reply not found', async t => {
  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: updateReplyMutation,
      variables: {
        input: {
          id: 'not-found',
          content: {
            type: 'paragraph',
            content: [{ type: 'text', text: 'test' }],
          },
        },
      },
    }),
    {
      message: /Reply not found/,
    }
  );
});

e2e('should delete reply work when user is reply owner', async t => {
  const docId = randomUUID();

  await app.login(owner);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const createReplyResult = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: deleteReplyMutation,
    variables: {
      id: createReplyResult.createReply.id,
    },
  });

  t.truthy(result.deleteReply);
});

e2e('should delete reply work when user is doc Editor', async t => {
  const docId = randomUUID();
  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Editor,
  });

  await app.login(member);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const createReplyResult = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: deleteReplyMutation,
    variables: {
      id: createReplyResult.createReply.id,
    },
  });

  t.truthy(result.deleteReply);
});

e2e('should delete reply work when user is doc Manager', async t => {
  const docId = randomUUID();

  await app.create(Mockers.DocUser, {
    workspaceId: teamWorkspace.id,
    docId,
    userId: member.id,
    type: DocRole.Manager,
  });

  await app.login(member);
  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: teamWorkspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const createReplyResult = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: deleteReplyMutation,
    variables: {
      id: createReplyResult.createReply.id,
    },
  });

  t.truthy(result.deleteReply);
});

e2e('should delete reply failed when reply not found', async t => {
  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: deleteReplyMutation,
      variables: {
        id: 'not-found',
      },
    }),
    {
      message: /Reply not found/,
    }
  );
});

// #endregion

// #region list comments and changes

e2e('should list comments and changes work', async t => {
  const docId = randomUUID();

  // 3 comments and 2 replies

  await app.login(owner);

  const createResult = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test 1' }],
        },
      },
    },
  });

  await app.login(member);

  const createResult2 = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test 2' }],
        },
      },
    },
  });

  const createResult3 = await app.gql({
    query: createCommentMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test 3' }],
        },
      },
    },
  });

  const createReplyResult1 = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test 1 reply 1' }],
        },
      },
    },
  });

  await app.login(owner);

  const createReplyResult2 = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test 1 reply 2' }],
        },
      },
    },
  });

  const result = await app.gql({
    query: listCommentsQuery,
    variables: {
      workspaceId: workspace.id,
      docId,
      pagination: {
        after: '',
      },
    },
  });

  // - comment-3 + member
  // - comment-2 + member
  // - comment-1 + owner
  //   - reply-1 + member
  //   - reply-2 + owner
  t.is(result.workspace.comments.totalCount, 3);
  t.is(result.workspace.comments.edges.length, 3);

  const comments = result.workspace.comments.edges.map(edge => edge.node);
  t.is(comments[0].id, createResult3.createComment.id);
  t.is(comments[0].user.id, member.id);
  t.is(comments[0].replies.length, 0);

  t.is(comments[1].id, createResult2.createComment.id);
  t.is(comments[1].user.id, member.id);
  t.is(comments[1].replies.length, 0);

  t.is(comments[2].id, createResult.createComment.id);
  t.is(comments[2].user.id, owner.id);
  t.is(comments[2].replies.length, 2);
  t.is(comments[2].replies[0].id, createReplyResult1.createReply.id);
  t.is(comments[2].replies[0].user.id, member.id);
  t.is(comments[2].replies[1].id, createReplyResult2.createReply.id);
  t.is(comments[2].replies[1].user.id, owner.id);

  // use listComments.pageInfo.startCursor as listCommentChanges.pagination.after
  let cursor = result.workspace.comments.pageInfo.startCursor;

  let result2 = await app.gql({
    query: listCommentChangesQuery,
    variables: {
      workspaceId: workspace.id,
      docId,
      pagination: {
        after: cursor,
      },
    },
  });

  // no changes
  t.is(result2.workspace.commentChanges.edges.length, 0);
  // cursor is not changed
  t.is(result2.workspace.commentChanges.pageInfo.endCursor, cursor);
  cursor = result2.workspace.commentChanges.pageInfo.endCursor;
  t.truthy(cursor);

  // new reply and delete comment1
  const createReplyResult3 = await app.gql({
    query: createReplyMutation,
    variables: {
      input: {
        commentId: createResult.createComment.id,
        docMode: DocMode.page,
        docTitle: 'test',
        content: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'test 1 reply 3' }],
        },
      },
    },
  });

  await app.gql({
    query: deleteCommentMutation,
    variables: {
      id: createResult.createComment.id,
    },
  });

  result2 = await app.gql({
    query: listCommentChangesQuery,
    variables: {
      workspaceId: workspace.id,
      docId,
      pagination: {
        after: cursor,
      },
    },
  });

  t.is(result2.workspace.commentChanges.edges.length, 2);
  t.is(
    result2.workspace.commentChanges.edges[0].node.id,
    createResult.createComment.id
  );
  t.is(
    result2.workspace.commentChanges.edges[0].node.action,
    CommentChangeAction.delete
  );
  t.is(
    result2.workspace.commentChanges.edges[1].node.id,
    createReplyResult3.createReply.id
  );
  t.is(
    result2.workspace.commentChanges.edges[1].node.commentId,
    createReplyResult3.createReply.commentId
  );
  t.is(
    result2.workspace.commentChanges.edges[1].node.action,
    CommentChangeAction.update
  );

  // cursor is changed
  t.not(result2.workspace.commentChanges.pageInfo.endCursor, cursor);
  cursor = result2.workspace.commentChanges.pageInfo.endCursor;

  // again, no changes
  result2 = await app.gql({
    query: listCommentChangesQuery,
    variables: {
      workspaceId: workspace.id,
      docId,
      pagination: {
        after: cursor,
      },
    },
  });

  t.is(result2.workspace.commentChanges.edges.length, 0);
  t.is(result2.workspace.commentChanges.pageInfo.endCursor, cursor);
});

// #endregion

// #region comment attachment

e2e('should upload comment attachment work', async t => {
  const docId = randomUUID();

  await app.login(owner);

  const buffer = Buffer.from('test');

  const res = await app
    .POST('/graphql')
    .field(
      'operations',
      JSON.stringify({
        name: 'uploadCommentAttachment',
        query: `mutation uploadCommentAttachment($attachment: Upload!) {
              uploadCommentAttachment(workspaceId: "${workspace.id}", docId: "${docId}", attachment: $attachment)
            }`,
        variables: { attachment: null },
      })
    )
    .field('map', JSON.stringify({ '0': ['variables.attachment'] }))
    .attach(
      '0',
      buffer,
      `attachment-${Math.random().toString(16).substring(2, 10)}.txt`
    )
    .expect(200);

  t.regex(
    res.body.data.uploadCommentAttachment,
    /^http:\/\/localhost:3010\/api\/workspaces\/[a-f0-9-]+\/docs\/[a-f0-9-]+\/comment-attachments\/[a-f0-9-]+$/
  );
});

e2e(
  'should upload comment attachment failed when user has no permission',
  async t => {
    const docId = randomUUID();
    await app.login(other);

    const buffer = Buffer.from('test');

    const res = await app
      .POST('/graphql')
      .field(
        'operations',
        JSON.stringify({
          name: 'uploadCommentAttachment',
          query: `mutation uploadCommentAttachment($attachment: Upload!) {
              uploadCommentAttachment(workspaceId: "${workspace.id}", docId: "${docId}", attachment: $attachment)
            }`,
          variables: { attachment: null },
        })
      )
      .field('map', JSON.stringify({ '0': ['variables.attachment'] }))
      .attach(
        '0',
        buffer,
        `attachment-${Math.random().toString(16).substring(2, 10)}.txt`
      )
      .expect(200);

    t.regex(
      res.body.errors[0].message,
      /You do not have permission to perform Doc\.Comments\.Create action on doc/
    );
  }
);

e2e(
  'should upload comment attachment failed when attachment size exceeds the limit',
  async t => {
    const docId = randomUUID();
    await app.login(owner);

    const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);

    const res = await app
      .POST('/graphql')
      .field(
        'operations',
        JSON.stringify({
          name: 'uploadCommentAttachment',
          query: `mutation uploadCommentAttachment($attachment: Upload!) {
              uploadCommentAttachment(workspaceId: "${workspace.id}", docId: "${docId}", attachment: $attachment)
            }`,
          variables: { attachment: null },
        })
      )
      .field('map', JSON.stringify({ '0': ['variables.attachment'] }))
      .attach(
        '0',
        buffer,
        `attachment-${Math.random().toString(16).substring(2, 10)}.txt`
      )
      .expect(200);

    t.regex(
      res.body.errors[0].message,
      /You have exceeded the comment attachment size quota/
    );
  }
);

// #endregion
