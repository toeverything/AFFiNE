import { Store } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import type { WorkspaceDBService } from '../../db';

export interface PinnedCollectionRecord {
  collectionId: string;
  index: string;
}

export class PinnedCollectionStore extends Store {
  constructor(private readonly workspaceDBService: WorkspaceDBService) {
    super();
  }

  watchPinnedCollectionDataReady() {
    return this.workspaceDBService.db.pinnedCollections.isReady$;
  }

  watchPinnedCollections(): Observable<PinnedCollectionRecord[]> {
    return this.workspaceDBService.db.pinnedCollections.find$();
  }

  addPinnedCollection(record: PinnedCollectionRecord) {
    this.workspaceDBService.db.pinnedCollections.create({
      collectionId: record.collectionId,
      index: record.index,
    });
  }

  removePinnedCollection(collectionId: string) {
    this.workspaceDBService.db.pinnedCollections.delete(collectionId);
  }
}
