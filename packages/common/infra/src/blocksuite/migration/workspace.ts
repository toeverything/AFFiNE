import type { Workspace } from '@blocksuite/store';
import type { Schema } from '@blocksuite/store';
import type { Doc as YDoc } from 'yjs';

import { migratePages } from './blocksuite';
import { upgradeV1ToV2 } from './subdoc';

interface MigrationOptions {
  doc: YDoc;
  schema: Schema;
  createWorkspace: () => Promise<Workspace>;
}

function createMigrationQueue(options: MigrationOptions) {
  return [
    async (doc: YDoc) => {
      const newWorkspace = await upgradeV1ToV2(doc, options.createWorkspace);
      return newWorkspace.doc;
    },
    async (doc: YDoc) => {
      await migratePages(doc, options.schema);
      return doc;
    },
  ];
}

/**
 * For split migrate function from MigrationQueue.
 */
export enum MigrationPoint {
  SubDoc = 1,
  BlockVersion = 2,
}

export async function migrateWorkspace(
  point: MigrationPoint,
  options: MigrationOptions
) {
  const migrationQueue = createMigrationQueue(options);
  const migrationFns = migrationQueue.slice(point - 1);

  let doc = options.doc;
  for (const migrate of migrationFns) {
    doc = await migrate(doc);
  }
  return doc;
}

export function checkWorkspaceCompatibility(
  workspace: Workspace
): MigrationPoint | null {
  const workspaceDocJSON = workspace.doc.toJSON();
  const spaceMetaObj = workspaceDocJSON['space:meta'];
  const docKeys = Object.keys(workspaceDocJSON);
  const haveSpaceMeta = !!spaceMetaObj && Object.keys(spaceMetaObj).length > 0;
  const haveLegacySpace = docKeys.some(key => key.startsWith('space:'));
  if (haveSpaceMeta || haveLegacySpace) {
    return MigrationPoint.SubDoc;
  }

  const hasVersion = workspace.meta.hasVersion;
  if (!hasVersion) {
    return MigrationPoint.BlockVersion;
  }

  try {
    workspace.meta.validateVersion(workspace);
  } catch (e) {
    console.info('validateVersion error', e);
    return MigrationPoint.BlockVersion;
  }

  return null;
}
