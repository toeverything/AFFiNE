import {
  Entity,
  generateFractionalIndexingKeyBetween,
} from '@toeverything/infra';

import type { FavoriteSupportType } from '../constant';
import type { FavoriteRecord, FavoriteStore } from '../stores/favorite';

export class FavoriteList extends Entity {
  list$ = this.store.watchFavorites();
  sortedList$ = this.list$.map(v =>
    v.sort((a, b) => (a.index > b.index ? 1 : -1))
  );
  isLoading$ = this.store.watchIsLoading();

  constructor(private readonly store: FavoriteStore) {
    super();
  }

  /**
   * get favorite record by type and id
   */
  favorite$(type: FavoriteSupportType, id: string) {
    return this.store.watchFavorite(type, id);
  }

  isFavorite$(type: FavoriteSupportType, id: string) {
    return this.favorite$(type, id).map(v => !!v);
  }

  add(
    type: FavoriteSupportType,
    id: string,
    index: string = this.indexAt('before')
  ) {
    return this.store.addFavorite(type, id, index);
  }

  toggle(
    type: FavoriteSupportType,
    id: string,
    index: string = this.indexAt('before')
  ) {
    if (this.favorite$(type, id).value) {
      return this.remove(type, id);
    } else {
      return this.add(type, id, index);
    }
  }

  remove(type: FavoriteSupportType, id: string) {
    return this.store.removeFavorite(type, id);
  }

  reorder(type: FavoriteSupportType, id: string, index: string) {
    return this.store.reorderFavorite(type, id, index);
  }

  indexAt(
    at: 'before' | 'after',
    targetRecord?: {
      type: FavoriteSupportType;
      id: string;
    }
  ) {
    if (!targetRecord) {
      if (at === 'before') {
        const first = this.sortedList$.value.at(0);
        return generateFractionalIndexingKeyBetween(null, first?.index || null);
      } else {
        const last = this.sortedList$.value.at(-1);
        return generateFractionalIndexingKeyBetween(last?.index || null, null);
      }
    } else {
      const sortedChildren = this.sortedList$.value;
      const targetIndex = sortedChildren.findIndex(
        node => node.id === targetRecord.id && node.type === targetRecord.type
      );
      if (targetIndex === -1) {
        throw new Error('Target favorite record not found');
      }
      const target = sortedChildren[targetIndex];
      const before: FavoriteRecord | null =
        sortedChildren[targetIndex - 1] || null;
      const after: FavoriteRecord | null =
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
