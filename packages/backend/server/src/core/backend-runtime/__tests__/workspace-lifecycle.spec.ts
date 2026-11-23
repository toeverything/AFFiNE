import test from 'ava';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { WorkspaceLifecycleMigration } from '../workspace-lifecycle';

test('migrate handles 200,000 root pages without stack overflow and preserves rootStatus', async t => {
  const count = 200_000;
  const doc = new YDoc();
  const pages = Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`,
    trash: i % 10 === 0,
  }));
  doc.getMap('meta').set('pages', pages);
  const rootBin = Buffer.from(encodeStateAsUpdate(doc));

  let migratedInput:
    | {
        workspaceId: string;
        sourceRevision: string;
        rootStatus: string;
        docs: { docId: string; trashed: boolean }[];
      }
    | undefined;

  const migration = new WorkspaceLifecycleMigration({
    async listWorkspaceLifecycleMigrationCandidatesV1() {
      return [];
    },
    async prepareWorkspaceLifecycleMigrationV1() {
      return {
        completed: false,
        revision: 'rev-200k',
        rootStatus: 'present',
        bin: rootBin,
      } as any;
    },
    async migrateWorkspaceLifecycleV1(input) {
      migratedInput = input as any;
      return true;
    },
  });

  await migration.ensure('ws-200k');

  t.truthy(migratedInput);
  t.is(migratedInput!.rootStatus, 'present');
  t.is(migratedInput!.docs.length, count);
  t.deepEqual(migratedInput!.docs[0], { docId: 'doc-0', trashed: true });
  t.deepEqual(migratedInput!.docs[1], { docId: 'doc-1', trashed: false });
  t.deepEqual(migratedInput!.docs[count - 1], {
    docId: `doc-${count - 1}`,
    trashed: false,
  });
});

test('migrate propagates resource limit errors without marking completed and succeeds on retry with default budget', async t => {
  const doc = new YDoc();
  doc.getMap('meta').set('name', 'Budget Test Workspace');
  doc.getMap('meta').set('pages', [
    { id: 'doc-trashed', trash: true },
    { id: 'doc-active', trash: false },
  ]);
  const rootBin = Buffer.from(encodeStateAsUpdate(doc));

  let migrateCalls = 0;
  let migratedInput:
    | {
        workspaceId: string;
        sourceRevision: string;
        rootStatus: string;
        docs: { docId: string; trashed: boolean }[];
      }
    | undefined;

  const runtime = {
    async listWorkspaceLifecycleMigrationCandidatesV1() {
      return [];
    },
    async prepareWorkspaceLifecycleMigrationV1() {
      return {
        completed: false,
        revision: 'rev-budget',
        rootStatus: 'present',
        bin: rootBin,
      } as any;
    },
    async migrateWorkspaceLifecycleV1(input: any) {
      migrateCalls += 1;
      migratedInput = input;
      return true;
    },
  };

  const constrained = new WorkspaceLifecycleMigration(runtime, {
    maxStructs: 1,
  });
  await t.throwsAsync(() => constrained.ensure('ws-budget'), {
    message: /\[affine-doc:resource_limit\]/,
  });
  t.is(
    migrateCalls,
    0,
    'must not commit completed checkpoint when resource limit is exceeded'
  );

  const defaultBudget = new WorkspaceLifecycleMigration(runtime);
  await defaultBudget.ensure('ws-budget');
  t.is(migrateCalls, 1);
  t.truthy(migratedInput);
  t.is(migratedInput!.sourceRevision, 'rev-budget');
  t.is(migratedInput!.rootStatus, 'present');
  t.deepEqual(migratedInput!.docs, [
    { docId: 'doc-trashed', trashed: true },
    { docId: 'doc-active', trashed: false },
  ]);
});

test('migrate still degrades corrupt binary to invalid_metadata with empty docs', async t => {
  let migratedInput:
    | {
        workspaceId: string;
        sourceRevision: string;
        rootStatus: string;
        docs: { docId: string; trashed: boolean }[];
      }
    | undefined;

  const migration = new WorkspaceLifecycleMigration({
    async listWorkspaceLifecycleMigrationCandidatesV1() {
      return [];
    },
    async prepareWorkspaceLifecycleMigrationV1() {
      return {
        completed: false,
        revision: 'rev-corrupt',
        rootStatus: 'present',
        bin: Buffer.from([255]),
      } as any;
    },
    async migrateWorkspaceLifecycleV1(input) {
      migratedInput = input as any;
      return true;
    },
  });

  await migration.ensure('ws-corrupt');
  t.truthy(migratedInput);
  t.is(migratedInput!.rootStatus, 'invalid_metadata');
  t.deepEqual(migratedInput!.docs, []);
});
