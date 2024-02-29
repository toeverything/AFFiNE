import type { Workspace } from '@blocksuite/store';
import type { Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

/**
 * For split migrate function from MigrationQueue.
 */
export enum MigrationPoint {
  SubDoc = 1,
  GuidFix = 2,
  BlockVersion = 3,
}

export function checkWorkspaceCompatibility(
  workspace: Workspace,
  isCloud: boolean
): MigrationPoint | null {
  // check if there is any key starts with 'space:' on root doc
  const spaceMetaObj = workspace.doc.share.get('space:meta') as
    | YMap<any>
    | undefined;
  const docKeys = Array.from(workspace.doc.share.keys());
  const haveSpaceMeta = !!spaceMetaObj && spaceMetaObj.size > 0;
  const haveLegacySpace = docKeys.some(key => key.startsWith('space:'));

  // DON'T UPGRADE SUBDOC ON CLOUD
  if (!isCloud && (haveSpaceMeta || haveLegacySpace)) {
    return MigrationPoint.SubDoc;
  }

  // exit if no pages
  if (!workspace.meta.docs?.length) {
    return null;
  }

  // check guid compatibility
  const meta = workspace.doc.getMap('meta') as YMap<unknown>;
  const pages = meta.get('pages') as YArray<YMap<unknown>>;
  for (const page of pages) {
    const pageId = page.get('id') as string | undefined;
    if (pageId?.includes(':')) {
      return MigrationPoint.GuidFix;
    }
  }
  const spaces = workspace.doc.getMap('spaces') as YMap<YDoc>;
  for (const [pageId, _] of spaces) {
    if (pageId.includes(':')) {
      return MigrationPoint.GuidFix;
    }
  }

  const hasVersion = workspace.meta.hasVersion;
  if (!hasVersion) {
    return MigrationPoint.BlockVersion;
  }

  // TODO: Catch compatibility error from blocksuite to show upgrade page.
  // Temporarily follow the check logic of blocksuite.
  if ((workspace.meta.docs?.length ?? 0) <= 1) {
    try {
      workspace.meta.validateVersion(workspace);
    } catch (e) {
      console.info('validateVersion error', e);
      return MigrationPoint.BlockVersion;
    }
  }

  // From v2, we depend on blocksuite to check and migrate data.
  const blockVersions = workspace.meta.blockVersions;
  for (const [flavour, version] of Object.entries(blockVersions ?? {})) {
    const schema = workspace.schema.flavourSchemaMap.get(flavour);
    if (schema?.version !== version) {
      return MigrationPoint.BlockVersion;
    }
  }

  return null;
}
