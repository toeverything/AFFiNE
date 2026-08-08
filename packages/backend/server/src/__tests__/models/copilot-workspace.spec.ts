import { PrismaClient, User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { BackendRuntimeProvider } from '../../core/backend-runtime';
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
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotWorkspace = module.get(CopilotWorkspaceConfigModel);
  t.context.runtime = module.get(BackendRuntimeProvider);
  t.context.db = module.get(PrismaClient);
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
    { workspaceId: workspace.id, mimeType: 'text/plain', libraryOwned: false },
    body
  );
  const repeated = await t.context.runtime.putWorkspaceArtifact(
    { workspaceId: workspace.id, mimeType: 'text/plain', libraryOwned: true },
    body
  );
  t.is(repeated.id, first.id);
  t.true(repeated.libraryOwned);

  const otherWorkspace = await t.context.workspace.create(user.id);
  const isolated = await t.context.runtime.putWorkspaceArtifact(
    {
      workspaceId: otherWorkspace.id,
      mimeType: 'text/plain',
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

  await t.context.runtime.setArtifactLibraryOwned(
    workspace.id,
    first.id,
    false
  );
  await t.context.db.workspaceArtifact.update({
    where: { id: first.id },
    data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
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
});
