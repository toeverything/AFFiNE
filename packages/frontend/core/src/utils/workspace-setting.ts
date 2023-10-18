import type { Collection } from '@affine/env/filter';
import type { Workspace } from '@blocksuite/store';
import { Array as YArray } from 'yjs';

import { updateFirstOfYArray } from './yjs-utils';

const COLLECTIONS_KEY = 'collections';
const SETTING_KEY = 'setting';

export class WorkspaceSetting {
  constructor(private workspace: Workspace) {}

  get doc() {
    return this.workspace.doc;
  }

  get setting() {
    return this.workspace.doc.getMap(SETTING_KEY);
  }

  get collectionsYArray() {
    if (!this.setting.has(COLLECTIONS_KEY)) {
      this.setting.set(COLLECTIONS_KEY, new YArray());
    }
    return this.setting.get(COLLECTIONS_KEY) as YArray<Collection>;
  }

  get collections(): Collection[] {
    return this.collectionsYArray.toArray() ?? [];
  }

  updateCollection(id: string, updater: (value: Collection) => Collection) {
    updateFirstOfYArray(
      this.collectionsYArray,
      v => v.id === id,
      v => {
        return updater(v);
      }
    );
  }

  addCollection(...collections: Collection[]) {
    this.doc.transact(() => {
      this.collectionsYArray.insert(0, collections);
    });
  }

  deleteCollection(...ids: string[]) {
    const set = new Set(ids);
    this.workspace.doc.transact(() => {
      const indexList: number[] = [];
      this.collectionsYArray.forEach((collection, i) => {
        if (set.has(collection.id)) {
          set.delete(collection.id);
          indexList.unshift(i);
        }
      });
      indexList.forEach(i => {
        this.collectionsYArray.delete(i);
      });
    });
  }
}

export const getWorkspaceSetting = (workspace: Workspace) => {
  return new WorkspaceSetting(workspace);
};
