import { LiveData, ObjectPool, Service } from '@toeverything/infra';
import { map } from 'rxjs';

import { Collection } from '../entities/collection';
import type { CollectionInfo, CollectionStore } from '../stores/collection';

export interface CollectionMeta extends Pick<CollectionInfo, 'id' | 'name'> {
  title: string;
}

export class CollectionService extends Service {
  constructor(private readonly store: CollectionStore) {
    super();
  }

  pool = new ObjectPool<string, Collection>({
    onDelete(obj) {
      obj.dispose();
    },
  });

  readonly collectionDataReady$ = LiveData.from(
    this.store.watchCollectionDataReady(),
    false
  );

  // collection metas used in collection list, only include `id` and `name`, without `rules` and `allowList`
  readonly collectionMetas$ = LiveData.from(
    this.store.watchCollectionMetas(),
    []
  );

  readonly collections$ = LiveData.from(
    this.store.watchCollectionIds().pipe(
      map(
        ids =>
          new Map<string, Collection>(
            ids.map(id => {
              const exists = this.pool.get(id);
              if (exists) {
                return [id, exists.obj];
              }
              const record = this.framework.createEntity(Collection, { id });
              this.pool.put(id, record);
              return [id, record] as const;
            })
          )
      )
    ),
    new Map<string, Collection>()
  );

  collection$(id: string) {
    return this.collections$.selector(collections => {
      return collections.get(id);
    });
  }

  createCollection(collectionInfo: Partial<Omit<CollectionInfo, 'id'>>) {
    return this.store.createCollection(collectionInfo);
  }

  updateCollection(
    id: string,
    collectionInfo: Partial<Omit<CollectionInfo, 'id'>>
  ) {
    return this.store.updateCollectionInfo(id, collectionInfo);
  }

  addDocToCollection(collectionId: string, docId: string) {
    const collection = this.collection$(collectionId).value;
    collection?.addDoc(docId);
  }

  removeDocFromCollection(collectionId: string, docId: string) {
    const collection = this.collection$(collectionId).value;
    collection?.removeDoc(docId);
  }

  deleteCollection(id: string) {
    this.store.deleteCollection(id);
  }
}
