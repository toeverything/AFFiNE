import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import { CommentAttachmentStorage } from '../../../core/storage';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

async function createWorkspace() {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  return {
    owner,
    workspace,
  };
}

e2e.afterEach.always(() => {
  mock.reset();
});

// #region comment attachment

e2e(
  'should get comment attachment not found when key is not exists',
  async t => {
    const { owner, workspace } = await createWorkspace();
    await app.login(owner);

    const docId = randomUUID();

    const res = await app.GET(
      `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/not-exists`
    );

    t.is(res.status, 404);
    t.is(res.body.message, 'Comment attachment not found.');
  }
);

e2e(
  'should get comment attachment no permission when user is not member',
  async t => {
    const { workspace } = await createWorkspace();
    // signup a new user
    await app.signup();

    const docId = randomUUID();

    const res = await app.GET(
      `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/some-key`
    );

    t.is(res.status, 403);
    t.regex(
      res.body.message,
      /You do not have permission to perform Doc.Read action on doc /
    );
  }
);

e2e('should get comment attachment body', async t => {
  const { owner, workspace } = await createWorkspace();
  await app.login(owner);

  const docId = randomUUID();
  const key = randomUUID();
  const attachment = app.get(CommentAttachmentStorage);
  await attachment.put(
    workspace.id,
    docId,
    key,
    'test.txt',
    Buffer.from('test'),
    owner.id
  );

  const res = await app.GET(
    `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/${key}`
  );

  t.is(res.status, 200);
  t.is(res.headers['content-type'], 'text/plain');
  t.is(res.headers['content-length'], '4');
  t.is(res.headers['cache-control'], 'private, max-age=2592000, immutable');
  t.regex(
    res.headers['last-modified'],
    /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/
  );
  t.is(res.text, 'test');
});

e2e('should get comment attachment redirect url', async t => {
  const { owner, workspace } = await createWorkspace();
  await app.login(owner);

  const docId = randomUUID();
  const key = randomUUID();
  const attachment = app.get(CommentAttachmentStorage);

  mock.method(attachment, 'get', async () => {
    return {
      body: null,
      metadata: null,
      redirectUrl: `https://foo.com/${key}`,
    };
  });

  const res = await app.GET(
    `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/${key}`
  );

  t.is(res.status, 302);
  t.is(res.headers['location'], `https://foo.com/${key}`);
});

// #endregion
