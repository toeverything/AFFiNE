import { migrateToSubdoc } from '@affine/env/blocksuite';
import type { LocalWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { nanoid, Workspace } from '@blocksuite/store';
import { createIndexeddbStorage } from '@blocksuite/store';
const Y = Workspace.Y;

export function upgradeV1ToV2(oldWorkspace: LocalWorkspace): LocalWorkspace {
  const oldDoc = oldWorkspace.blockSuiteWorkspace.doc;
  const newDoc = migrateToSubdoc(oldDoc);
  if (newDoc === oldDoc) {
    console.warn('do not need update');
    return oldWorkspace;
  } else {
    const id = nanoid();
    const newBlockSuiteWorkspace = getOrCreateWorkspace(
      id,
      WorkspaceFlavour.LOCAL
    );
    Y.applyUpdate(newBlockSuiteWorkspace.doc, Y.encodeStateAsUpdate(newDoc));
    newDoc.getSubdocs().forEach(subdoc => {
      newBlockSuiteWorkspace.doc.getSubdocs().forEach(newDoc => {
        if (subdoc.guid === newDoc.guid) {
          Y.applyUpdate(newDoc, Y.encodeStateAsUpdate(subdoc));
        }
      });
    });
    console.log('migration result', newBlockSuiteWorkspace.doc.toJSON());

    return {
      blockSuiteWorkspace: newBlockSuiteWorkspace,
      flavour: WorkspaceFlavour.LOCAL,
      id,
    };
  }
}

export async function migrateLocalBlobStorage(from: string, to: string) {
  const fromStorage = createIndexeddbStorage(from);
  const toStorage = createIndexeddbStorage(to);
  const keys = await fromStorage.crud.list();
  for (const key of keys) {
    const value = await fromStorage.crud.get(key);
    if (!value) {
      console.warn('cannot find blob:', key);
      continue;
    }
    await toStorage.crud.set(key, value);
  }
}
