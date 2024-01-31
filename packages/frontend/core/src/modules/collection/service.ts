import type {
  Collection,
  DeleteCollectionInfo,
  DeletedCollection,
} from '@affine/env/filter';
import type { Workspace } from '@toeverything/infra';
import { LiveData } from '@toeverything/infra/livedata';
import { Observable } from 'rxjs';
import { Array as YArray } from 'yjs';

const SETTING_KEY = 'setting';

const COLLECTIONS_KEY = 'collections';
const COLLECTIONS_TRASH_KEY = 'collections_trash';

export class CollectionService {
  constructor(private readonly workspace: Workspace) {}

  private get doc() {
    return this.workspace.blockSuiteWorkspace.doc;
  }

  private get setting() {
    return this.workspace.blockSuiteWorkspace.doc.getMap(SETTING_KEY);
  }

  private get collectionsYArray(): YArray<Collection> | undefined {
    return this.setting.get(COLLECTIONS_KEY) as YArray<Collection>;
  }

  private get collectionsTrashYArray(): YArray<DeletedCollection> | undefined {
    return this.setting.get(COLLECTIONS_TRASH_KEY) as YArray<DeletedCollection>;
  }

  readonly collections = LiveData.from(
    new Observable<Collection[]>(subscriber => {
      subscriber.next(this.collectionsYArray?.toArray() ?? []);
      const fn = () => {
        subscriber.next(this.collectionsYArray?.toArray() ?? []);
      };
      this.setting.observeDeep(fn);
      return () => {
        this.setting.unobserveDeep(fn);
      };
    }),
    []
  );

  readonly collectionsTrash = LiveData.from(
    new Observable<DeletedCollection[]>(subscriber => {
      subscriber.next(this.collectionsTrashYArray?.toArray() ?? []);
      const fn = () => {
        subscriber.next(this.collectionsTrashYArray?.toArray() ?? []);
      };
      this.setting.observeDeep(fn);
      return () => {
        this.setting.unobserveDeep(fn);
      };
    }),
    []
  );

  addCollection(...collections: Collection[]) {
    if (!this.setting.has(COLLECTIONS_KEY)) {
      this.setting.set(COLLECTIONS_KEY, new YArray());
    }
    this.doc.transact(() => {
      this.collectionsYArray?.insert(0, collections);
    });
  }

  updateCollection(id: string, updater: (value: Collection) => Collection) {
    if (this.collectionsYArray) {
      updateFirstOfYArray(
        this.collectionsYArray,
        v => v.id === id,
        v => {
          return updater(v);
        }
      );
    }
  }

  deleteCollection(info: DeleteCollectionInfo, ...ids: string[]) {
    const collectionsYArray = this.collectionsYArray;
    if (!collectionsYArray) {
      return;
    }
    const set = new Set(ids);
    this.workspace.blockSuiteWorkspace.doc.transact(() => {
      const indexList: number[] = [];
      const list: Collection[] = [];
      collectionsYArray.forEach((collection, i) => {
        if (set.has(collection.id)) {
          set.delete(collection.id);
          indexList.unshift(i);
          list.push(JSON.parse(JSON.stringify(collection)));
        }
      });
      indexList.forEach(i => {
        collectionsYArray.delete(i);
      });
      if (!this.collectionsTrashYArray) {
        this.setting.set(COLLECTIONS_TRASH_KEY, new YArray());
      }
      const collectionsTrashYArray = this.collectionsTrashYArray;
      if (!collectionsTrashYArray) {
        return;
      }
      collectionsTrashYArray.insert(
        0,
        list.map(collection => ({
          userId: info?.userId,
          userName: info ? info.userName : 'Local User',
          collection,
        }))
      );
      if (collectionsTrashYArray.length > 10) {
        collectionsTrashYArray.delete(10, collectionsTrashYArray.length - 10);
      }
    });
  }

  private deletePagesFromCollection(
    collection: Collection,
    idSet: Set<string>
  ) {
    const newAllowList = collection.allowList.filter(id => !idSet.has(id));
    if (newAllowList.length !== collection.allowList.length) {
      this.updateCollection(collection.id, old => {
        return {
          ...old,
          allowList: newAllowList,
        };
      });
    }
  }

  deletePagesFromCollections(ids: string[]) {
    const idSet = new Set(ids);
    this.doc.transact(() => {
      this.collections.value.forEach(collection => {
        this.deletePagesFromCollection(collection, idSet);
      });
    });
  }
}

const updateFirstOfYArray = <T>(
  array: YArray<T>,
  p: (value: T) => boolean,
  update: (value: T) => T
) => {
  array.doc?.transact(() => {
    for (let i = 0; i < array.length; i++) {
      const ele = array.get(i);
      if (p(ele)) {
        array.delete(i);
        array.insert(i, [update(ele)]);
        return;
      }
    }
  });
};
