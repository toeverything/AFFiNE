import { randomUUID } from 'node:crypto';

import { PrismaClient, User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config } from '../../base';
import { CopilotContextModel } from '../../models/copilot-context';
import { CopilotWorkspaceConfigModel } from '../../models/copilot-workspace';
import { DocModel } from '../../models/doc';
import { UserModel } from '../../models/user';
import { WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';
import { cleanObject } from '../utils/copilot';

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  doc: DocModel;
  user: UserModel;
  workspace: WorkspaceModel;
  copilotContext: CopilotContextModel;
  copilotWorkspace: CopilotWorkspaceConfigModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotContext = module.get(CopilotContextModel);
  t.context.copilotWorkspace = module.get(CopilotWorkspaceConfigModel);
  t.context.db = module.get(PrismaClient);
  t.context.doc = module.get(DocModel);
  t.context.config = module.get(Config);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;

let docId = 'doc1';

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.workspace.create(user.id);
});

test.after(async t => {
  await t.context.module.close();
});

test('should manage copilot workspace ignored docs', async t => {
  const ignoredDocs = await t.context.copilotWorkspace.listIgnoredDocs(
    workspace.id
  );
  t.deepEqual(ignoredDocs, []);

  {
    const count = await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      [docId]
    );
    t.snapshot(count, 'should add ignored doc');

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.snapshot(cleanObject(ret), 'should return added doc');

    const check = await t.context.copilotWorkspace.checkIgnoredDocs(
      workspace.id,
      [docId]
    );
    t.snapshot(check, 'should return ignored docs in workspace');
  }

  {
    const count = await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      [docId]
    );
    t.snapshot(count, 'should not change if ignored doc exists');

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.snapshot(cleanObject(ret), 'should not add ignored doc again');
  }

  {
    const count = await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      ['new_doc']
    );
    t.snapshot(count, 'should add new ignored doc');

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.snapshot(cleanObject(ret), 'should add ignored doc');
  }

  {
    await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      undefined,
      [docId]
    );

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.snapshot(cleanObject(ret), 'should remove ignored doc');
  }
});

test('should insert and search embedding', async t => {
  {
    const { fileId } = await t.context.copilotWorkspace.addFile(workspace.id, {
      fileName: 'file1',
      blobId: 'blob1',
      mimeType: 'text/plain',
      size: 1,
    });
    await t.context.copilotWorkspace.insertFileEmbeddings(
      workspace.id,
      fileId,
      [
        {
          index: 0,
          content: 'content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    {
      const ret = await t.context.copilotWorkspace.matchFileEmbedding(
        workspace.id,
        Array.from({ length: 1024 }, () => 0.9),
        1,
        1
      );
      t.snapshot(
        cleanObject(ret, ['fileId']),
        'should match workspace file embedding'
      );
    }
  }

  {
    await t.context.db.blob.create({
      data: {
        workspaceId: workspace.id,
        key: 'blob-test',
        mime: 'text/plain',
        size: 1,
      },
    });

    const blobId = 'blob-test';
    await t.context.copilotWorkspace.insertBlobEmbeddings(
      workspace.id,
      blobId,
      [
        {
          index: 0,
          content: 'blob content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    {
      const ret = await t.context.copilotWorkspace.matchBlobEmbedding(
        workspace.id,
        Array.from({ length: 1024 }, () => 0.9),
        1,
        1
      );
      t.snapshot(cleanObject(ret), 'should match workspace blob embedding');
    }

    await t.context.copilotWorkspace.removeBlob(workspace.id, blobId);

    {
      const ret = await t.context.copilotWorkspace.matchBlobEmbedding(
        workspace.id,
        Array.from({ length: 1024 }, () => 0.9),
        1,
        1
      );
      t.deepEqual(ret, [], 'should not match after removal');
    }
  }

  {
    const docId = randomUUID();
    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId,
      blob: Uint8Array.from([1, 2, 3]),
      timestamp: Date.now(),
      editorId: user.id,
    });

    const toBeEmbedDocIds = await t.context.copilotWorkspace.findDocsToEmbed(
      workspace.id
    );
    t.snapshot(toBeEmbedDocIds.length, 'should find docs to embed');

    await t.context.copilotContext.insertWorkspaceEmbedding(
      workspace.id,
      docId,
      [
        {
          index: 0,
          content: 'content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    const afterInsertEmbedding =
      await t.context.copilotWorkspace.findDocsToEmbed(workspace.id);
    t.snapshot(afterInsertEmbedding.length, 'should not find docs to embed');
  }

  {
    const docId = randomUUID();
    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId,
      blob: Uint8Array.from([1, 2, 3]),
      timestamp: Date.now(),
      editorId: user.id,
    });

    const toBeEmbedDocIds = await t.context.copilotWorkspace.findDocsToEmbed(
      workspace.id
    );
    t.snapshot(toBeEmbedDocIds.length, 'should find docs to embed');

    await t.context.copilotWorkspace.updateIgnoredDocs(workspace.id, [docId]);

    const afterAddIgnoreDocs = await t.context.copilotWorkspace.findDocsToEmbed(
      workspace.id
    );
    t.snapshot(afterAddIgnoreDocs.length, 'should not find docs to embed');
  }

  {
    const docId = `foo$bar`;
    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId: docId,
      blob: Uint8Array.from([1, 2, 3]),
      timestamp: Date.now(),
      editorId: user.id,
    });
    const results = await t.context.copilotWorkspace.findDocsToEmbed(
      workspace.id
    );
    t.false(results.includes(docId), 'docs containing `$` should be excluded');
  }

  {
    const docId = 'empty_doc';
    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId: docId,
      blob: Uint8Array.from([0, 0]),
      timestamp: Date.now(),
      editorId: user.id,
    });
    const results = await t.context.copilotWorkspace.findDocsToEmbed(
      workspace.id
    );
    t.false(results.includes(docId), 'empty documents should be excluded');
  }
});

test('should check need to be embedded', async t => {
  const docId = randomUUID();

  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Uint8Array.from([1, 2, 3]),
    timestamp: Date.now(),
    editorId: user.id,
  });

  {
    let needsEmbedding = await t.context.copilotWorkspace.checkDocNeedEmbedded(
      workspace.id,
      docId
    );
    t.snapshot(
      needsEmbedding,
      'document with no embedding should need embedding'
    );
  }

  {
    await t.context.copilotContext.insertWorkspaceEmbedding(
      workspace.id,
      docId,
      [
        {
          index: 0,
          content: 'content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    let needsEmbedding = await t.context.copilotWorkspace.checkDocNeedEmbedded(
      workspace.id,
      docId
    );
    t.snapshot(
      needsEmbedding,
      'document with recent embedding should not need embedding'
    );
  }

  {
    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId,
      blob: Uint8Array.from([4, 5, 6]),
      timestamp: Date.now() + 1000, // Ensure timestamp is later
      editorId: user.id,
    });

    // simulate an old embedding
    const oldEmbeddingTime = new Date(Date.now() - 25 * 60 * 1000);
    await t.context.db.aiWorkspaceEmbedding.updateMany({
      where: { workspaceId: workspace.id, docId },
      data: { updatedAt: oldEmbeddingTime },
    });

    let needsEmbedding = await t.context.copilotWorkspace.checkDocNeedEmbedded(
      workspace.id,
      docId
    );
    t.snapshot(
      needsEmbedding,
      'document updated after embedding and older-than-10m should need embedding'
    );
  }

  {
    // only time passed (>10m since last embedding) but no doc updates => should NOT re-embed
    const baseNow = Date.now();
    const docId2 = randomUUID();
    const t0 = baseNow - 30 * 60 * 1000; // snapshot updated 30 minutes ago
    const t1 = baseNow - 25 * 60 * 1000; // embedding updated 25 minutes ago

    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId: docId2,
      blob: Uint8Array.from([1, 2, 3]),
      timestamp: t0,
      editorId: user.id,
    });

    await t.context.copilotContext.insertWorkspaceEmbedding(
      workspace.id,
      docId2,
      [
        {
          index: 0,
          content: 'content2',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    await t.context.db.aiWorkspaceEmbedding.updateMany({
      where: { workspaceId: workspace.id, docId: docId2 },
      data: { updatedAt: new Date(t1) },
    });

    let needsEmbedding = await t.context.copilotWorkspace.checkDocNeedEmbedded(
      workspace.id,
      docId2
    );
    t.snapshot(
      needsEmbedding,
      'should not need embedding when only 10-minute window passed without updates'
    );

    const t2 = baseNow - 5 * 60 * 1000; // doc updated 5 minutes ago
    await t.context.doc.upsert({
      spaceId: workspace.id,
      docId: docId2,
      blob: Uint8Array.from([7, 8, 9]),
      timestamp: t2,
      editorId: user.id,
    });

    needsEmbedding = await t.context.copilotWorkspace.checkDocNeedEmbedded(
      workspace.id,
      docId2
    );
    t.snapshot(
      needsEmbedding,
      'should need embedding when doc updated and last embedding older than 10 minutes'
    );
  }
  // --- new cases end ---
});

test('should check embedding table', async t => {
  {
    const ret = await t.context.copilotWorkspace.checkEmbeddingAvailable();
    t.true(ret, 'should return true when embedding table is available');
  }

  // {
  //   await t.context.db
  //     .$executeRaw`DROP TABLE IF EXISTS "ai_workspace_file_embeddings"`;
  //   const ret = await t.context.copilotWorkspace.checkEmbeddingAvailable();
  //   t.false(ret, 'should return false when embedding table is not available');
  // }
});

test('should filter outdated doc id style in embedding status', async t => {
  const docId = randomUUID();
  const outdatedDocId = `${workspace.id}:space:${docId}`;

  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Uint8Array.from([1, 2, 3]),
    timestamp: Date.now(),
    editorId: user.id,
  });

  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId: outdatedDocId,
    blob: Uint8Array.from([1, 2, 3]),
    timestamp: Date.now(),
    editorId: user.id,
  });

  {
    const status = await t.context.copilotWorkspace.getEmbeddingStatus(
      workspace.id
    );
    t.snapshot(status, 'should include modern doc format');
  }

  {
    await t.context.copilotContext.insertWorkspaceEmbedding(
      workspace.id,
      docId,
      [
        {
          index: 0,
          content: 'content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    const status = await t.context.copilotWorkspace.getEmbeddingStatus(
      workspace.id
    );
    t.snapshot(status, 'should count docs after filtering outdated');
  }
});
