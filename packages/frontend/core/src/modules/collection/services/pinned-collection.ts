import {
  generateFractionalIndexingKeyBetween,
  LiveData,
  Service,
} from '@toeverything/infra';

import type {
  PinnedCollectionRecord,
  PinnedCollectionStore,
} from '../stores/pinned-collection';

export class PinnedCollectionService extends Service {
  constructor(private readonly pinnedCollectionStore: PinnedCollectionStore) {
    super();
  }

  pinnedCollectionDataReady$ = LiveData.from(
    this.pinnedCollectionStore.watchPinnedCollectionDataReady(),
    false
  );

  pinnedCollections$ = LiveData.from<PinnedCollectionRecord[]>(
    this.pinnedCollectionStore.watchPinnedCollections(),
    []
  );

  sortedPinnedCollections$ = this.pinnedCollections$.map(records =>
    records.toSorted((a, b) => {
      return a.index > b.index ? 1 : -1;
    })
  );

  addPinnedCollection(record: PinnedCollectionRecord) {
    this.pinnedCollectionStore.addPinnedCollection(record);
  }

  removePinnedCollection(collectionId: string) {
    this.pinnedCollectionStore.removePinnedCollection(collectionId);
  }

  indexAt(at: 'before' | 'after', targetId?: string) {
    if (!targetId) {
      if (at === 'before') {
        const first = this.sortedPinnedCollections$.value.at(0);
        return generateFractionalIndexingKeyBetween(null, first?.index || null);
      } else {
        const last = this.sortedPinnedCollections$.value.at(-1);
        return generateFractionalIndexingKeyBetween(last?.index || null, null);
      }
    } else {
      const sortedChildren = this.sortedPinnedCollections$.value;
      const targetIndex = sortedChildren.findIndex(
        node => node.collectionId === targetId
      );
      if (targetIndex === -1) {
        throw new Error('Target node not found');
      }
      const target = sortedChildren[targetIndex];
      const before: PinnedCollectionRecord | null =
        sortedChildren[targetIndex - 1] || null;
      const after: PinnedCollectionRecord | null =
        sortedChildren[targetIndex + 1] || null;
      if (at === 'before') {
        return generateFractionalIndexingKeyBetween(
          before?.index || null,
          target.index
        );
      } else {
        return generateFractionalIndexingKeyBetween(
          target.index,
          after?.index || null
        );
      }
    }
  }
}
