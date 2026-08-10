import { createHash } from 'node:crypto';

import { PrismaClient, User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { WorkspaceBlobStorage } from '../../core/storage';
import { CopilotWorkspaceConfigModel } from '../../models/copilot-workspace';
import { UserModel } from '../../models/user';
import { WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  user: UserModel;
  workspace: WorkspaceModel;
  copilotWorkspace: CopilotWorkspaceConfigModel;
  runtime: BackendRuntimeProvider;
  db: PrismaClient;
  storage: WorkspaceBlobStorage;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotWorkspace = module.get(CopilotWorkspaceConfigModel);
  t.context.runtime = module.get(BackendRuntimeProvider);
  t.context.db = module.get(PrismaClient);
  t.context.storage = module.get(WorkspaceBlobStorage);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.user.create({ email: 'test@affine.pro' });
  workspace = await t.context.workspace.create(user.id);
});

test.after(async t => {
  await t.context.module.close();
});

test('should manage workspace ignored documents', async t => {
  t.is(await t.context.copilotWorkspace.countIgnoredDocs(workspace.id), 0);
  t.is(
    await t.context.copilotWorkspace.updateIgnoredDocs(workspace.id, ['doc1']),
    1
  );
  t.is(
    await t.context.copilotWorkspace.updateIgnoredDocs(workspace.id, ['doc1']),
    0
  );
  t.is(
    await t.context.copilotWorkspace.updateIgnoredDocs(workspace.id, ['doc2']),
    1
  );
  t.is(await t.context.copilotWorkspace.countIgnoredDocs(workspace.id), 2);
  const firstPage = await t.context.copilotWorkspace.listIgnoredDocs(
    workspace.id,
    { offset: 0, first: 1 }
  );
  t.is(firstPage.length, 1);
  t.true(['doc1', 'doc2'].includes(firstPage[0].docId));
  t.deepEqual(
    await t.context.copilotWorkspace.checkIgnoredDocs(workspace.id, [
      'doc1',
      'doc2',
    ]),
    ['doc1', 'doc2']
  );
  t.is(
    await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      [],
      ['doc1', 'doc2']
    ),
    2
  );
  t.is(await t.context.copilotWorkspace.countIgnoredDocs(workspace.id), 0);
});

test('workspace artifacts deduplicate bytes and remain workspace isolated', async t => {
  const body = Buffer.from('shared artifact');
  const first = await t.context.runtime.putWorkspaceArtifact(
    {
      workspaceId: workspace.id,
      mimeType: 'text/plain',
      displayName: 'first.txt',
      fileName: 'first.txt',
      libraryOwned: false,
    },
    body
  );
  const repeated = await t.context.runtime.putWorkspaceArtifact(
    {
      workspaceId: workspace.id,
      mimeType: 'text/plain',
      displayName: 'repeated.txt',
      fileName: 'repeated.txt',
      libraryOwned: true,
    },
    body
  );
  t.is(repeated.id, first.id);
  t.is(repeated.displayName, 'repeated.txt');
  t.is(repeated.fileName, 'first.txt');
  t.true(repeated.libraryOwned);

  const unnamed = await t.context.runtime.putWorkspaceArtifact(
    {
      workspaceId: workspace.id,
      mimeType: 'application/octet-stream',
      libraryOwned: false,
    },
    Buffer.from('unnamed artifact')
  );
  await t.throwsAsync(
    t.context.runtime.setArtifactLibraryOwned(workspace.id, unnamed.id, true),
    { message: 'artifact_library_display_name_required' }
  );
  await t.throwsAsync(
    t.context.runtime.setArtifactLibraryOwned(
      workspace.id,
      '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      false
    ),
    { message: 'artifact_not_found' }
  );

  const blobId = createHash('sha256').update(body).digest('base64url');
  await t.context.storage.put(workspace.id, blobId, body);
  await t.throwsAsync(
    t.context.runtime.ensureWorkspaceBlobArtifact({
      workspaceId: workspace.id,
      blobId,
      mimeType: 'text/plain',
      libraryOwned: true,
    }),
    { message: 'artifact_library_display_name_required' }
  );
  await t.context.db.workspaceArtifact.update({
    where: { id: first.id },
    data: {
      status: 'reserving',
      reservationExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  const aliased = await t.context.runtime.ensureWorkspaceBlobArtifact({
    workspaceId: workspace.id,
    blobId,
    mimeType: 'text/plain',
    libraryOwned: false,
  });
  t.is(aliased.id, first.id);
  t.is(aliased.status, 'ready');
  t.is(aliased.storageScope, 'copilot');

  const otherWorkspace = await t.context.workspace.create(user.id);
  const isolated = await t.context.runtime.putWorkspaceArtifact(
    {
      workspaceId: otherWorkspace.id,
      mimeType: 'text/plain',
      fileName: 'isolated.txt',
      libraryOwned: false,
    },
    body
  );
  t.not(isolated.id, first.id);
  t.is(isolated.contentHash, first.contentHash);
  t.is(
    await t.context.db.workspaceArtifact.count({
      where: { contentHash: first.contentHash },
    }),
    2
  );

  const session = await t.context.db.aiSession.create({
    data: {
      userId: user.id,
      workspaceId: otherWorkspace.id,
      promptName: 'Chat With AFFiNE AI',
    },
  });
  const message = await t.context.db.aiSessionMessage.create({
    data: { sessionId: session.id, role: 'user', content: 'attachment' },
  });
  await t.context.db.aiMessageArtifact.create({
    data: {
      messageId: message.id,
      workspaceId: otherWorkspace.id,
      artifactId: isolated.id,
      role: 'attachment',
    },
  });
  await t.context.workspace.delete(otherWorkspace.id);
  t.is(
    await t.context.db.aiMessageArtifact.count({
      where: { artifactId: isolated.id },
    }),
    0
  );

  await t.context.runtime.setArtifactLibraryOwned(
    workspace.id,
    first.id,
    false
  );
  await t.context.db.$executeRaw`UPDATE workspace_artifacts
    SET created_at='2026-01-01T00:00:00.000Z', updated_at='2026-01-01T00:00:00.000Z'
    WHERE id=${first.id}::uuid`;
  const reused = await t.context.runtime.putWorkspaceArtifact(
    {
      workspaceId: workspace.id,
      mimeType: 'text/plain',
      displayName: 'reused.txt',
      fileName: 'reused.txt',
      libraryOwned: false,
    },
    body
  );
  t.is(reused.id, first.id);
  t.is(await t.context.runtime.cleanupUnreferencedArtifacts(1), 0);
  await t.context.db.$executeRaw`UPDATE workspace_artifacts
    SET updated_at='2026-01-01T00:00:00.000Z'
    WHERE id=${first.id}::uuid`;
  const retainedSession = await t.context.db.aiSession.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      promptName: 'Chat With AFFiNE AI',
    },
  });
  const retainedMessage = await t.context.db.aiSessionMessage.create({
    data: {
      sessionId: retainedSession.id,
      role: 'user',
      content: 'retained attachment',
      artifacts: {
        create: {
          workspaceId: workspace.id,
          artifactId: first.id,
          role: 'attachment',
        },
      },
    },
  });
  t.is(await t.context.runtime.cleanupUnreferencedArtifacts(1), 0);
  await t.context.db.aiSessionMessage.delete({
    where: { id: retainedMessage.id },
  });
  t.is(await t.context.runtime.cleanupUnreferencedArtifacts(1), 1);
  const [source] = await t.context.db.$queryRaw<
    { deletedAt: Date | null }[]
  >`SELECT deleted_at AS "deletedAt" FROM embedding_sources
    WHERE workspace_id=${workspace.id} AND source_kind='artifact' AND source_key=${first.id}`;
  t.truthy(source?.deletedAt);
  t.is(
    await t.context.db.workspaceArtifact.count({ where: { id: first.id } }),
    0
  );

  const deletingBody = Buffer.from('cleanup retry');
  const deletingBlobId = createHash('sha256')
    .update(deletingBody)
    .digest('base64url');
  await t.context.storage.put(workspace.id, deletingBlobId, deletingBody);
  const deleting = await t.context.runtime.ensureWorkspaceBlobArtifact({
    workspaceId: workspace.id,
    blobId: deletingBlobId,
    mimeType: 'text/plain',
    libraryOwned: false,
  });
  t.is(deleting.storageScope, 'blob');
  await t.context.db.workspaceArtifact.update({
    where: { id: deleting.id },
    data: { status: 'deleting' },
  });
  await t.context.storage.delete(workspace.id, deletingBlobId, true);
  t.is(await t.context.runtime.cleanupUnreferencedArtifacts(1), 1);
  t.is(
    await t.context.db.workspaceArtifact.count({ where: { id: deleting.id } }),
    0
  );
});
