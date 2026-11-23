import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { mock } from 'node:test';

import { PrismaClient } from '@prisma/client';

import { StorageRuntimeProvider } from '../../../core/storage-runtime';
import { DocRole, WorkspaceRole } from '../../../models';
import { getMime } from '../../../native';
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

const objects = new Map<
  string,
  {
    body: Buffer;
    metadata?: {
      contentLength?: number;
      contentType?: string;
      checksumCRC32?: string;
      lastModified?: Date;
    };
  }
>();

e2e.beforeEach(() => {
  objects.clear();
  const rt = app.get(StorageRuntimeProvider);
  mock.method(
    rt,
    'putObject',
    async (
      _scope: string,
      key: string,
      body: Buffer,
      metadata?: {
        contentLength?: number;
        contentType?: string;
        checksumCRC32?: string;
      }
    ) => {
      const object = {
        body,
        metadata: {
          ...metadata,
          contentType: metadata?.contentType ?? getMime(body),
          contentLength: metadata?.contentLength ?? body.length,
          lastModified: new Date(),
        },
      };
      objects.set(key, object);
      return object.metadata;
    }
  );
  mock.method(rt, 'getObject', async (_scope: string, key: string) => {
    const object = objects.get(key);
    if (!object) {
      return {};
    }
    return {
      body: Readable.from(object.body),
      metadata: object.metadata,
    };
  });
  mock.method(rt, 'presignGet', async () => undefined);
});

e2e(
  'document aliases use the canonical subject for authorization and I/O',
  async t => {
    const { owner, workspace } = await createWorkspace();
    const member = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: member.id,
      type: WorkspaceRole.Collaborator,
    });
    const snapshot = await app.create(Mockers.DocSnapshot, {
      workspaceId: workspace.id,
      user: owner,
    });
    await app.create(Mockers.DocMeta, {
      workspaceId: workspace.id,
      docId: snapshot.id,
      defaultRole: DocRole.None,
    });

    await app.login(member);
    const res = await app.GET(
      `/api/workspaces/${workspace.id}/docs/space:${snapshot.id}`
    );

    t.is(res.status, 403);
    t.is(res.body.data.docId, snapshot.id);
  }
);

// #region comment attachment

e2e.serial(
  'should get comment attachment not found when key is not exists',
  async t => {
    const { owner, workspace } = await createWorkspace();
    await app.login(owner);

    const docId = randomUUID();

    const res = await app.GET(
      `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/not-exists`
    );

    t.snapshot({ status: res.status, body: res.body });
  }
);

e2e.serial(
  'should get comment attachment no permission when user is not member',
  async t => {
    const { workspace } = await createWorkspace();
    // signup a new user
    await app.signup();

    const docId = randomUUID();

    const res = await app.GET(
      `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/some-key`
    );

    t.is(
      res.body.message,
      `You do not have permission to perform Doc.Read action on doc ${docId}.`
    );
    t.snapshot({
      status: res.status,
      body: {
        ...res.body,
        message: res.body.message.replace(docId, '<doc-id>'),
        data: { action: res.body.data.action },
      },
    });
  }
);

e2e.serial('should get comment attachment body', async t => {
  const { owner, workspace } = await createWorkspace();
  await app.login(owner);
  const docId = randomUUID();
  const key = randomUUID();
  const body = Buffer.from('test');
  objects.set(`comment-attachments/${workspace.id}/${docId}/${key}`, {
    body,
    metadata: {
      contentType: 'text/plain',
      contentLength: body.length,
      lastModified: new Date(),
    },
  });
  await app.get(PrismaClient).commentAttachment.create({
    data: {
      workspaceId: workspace.id,
      docId,
      key,
      name: 'test.txt',
      mime: 'text/plain',
      size: body.length,
      status: 'completed',
      createdBy: owner.id,
    },
  });

  const res = await app.GET(
    `/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/${key}`
  );

  t.snapshot({
    status: res.status,
    contentType: res.headers['content-type'],
    contentLength: res.headers['content-length'],
    cacheControl: res.headers['cache-control'],
    hasLastModified: Boolean(res.headers['last-modified']),
    body: res.text,
  });
});

// #endregion
