import { LiveData, Store } from '@toeverything/infra';
import { map } from 'rxjs';

import type { WorkspaceDBService } from '../../db';
import type { FavoriteSupportTypeUnion } from '../constant';
import { isFavoriteSupportType } from '../constant';

export interface FavoriteRecord {
  type: FavoriteSupportTypeUnion;
  id: string;
  index: string;
}

export class FavoriteStore extends Store {
  constructor(private readonly workspaceDBService: WorkspaceDBService) {
    super();
  }

  watchIsLoading() {
    return (
      this.workspaceDBService.userdataDB$
        .map(db => LiveData.from(db.favorite.isLoading$, false))
        // oxlint-disable-next-line unicorn/prefer-array-flat-map -- LiveData doesn't have flatMap
        .flat()
    );
  }

  watchFavorites() {
    return (
      this.workspaceDBService.userdataDB$
        .map(db => LiveData.from(db.favorite.find$(), []))
        // oxlint-disable-next-line unicorn/prefer-array-flat-map -- LiveData doesn't have flatMap
        .flat()
        .map(raw => {
          return raw
            .map(data => this.toRecord(data))
            .filter((record): record is FavoriteRecord => !!record);
        })
    );
  }

  addFavorite(
    type: FavoriteSupportTypeUnion,
    id: string,
    index: string
  ): FavoriteRecord {
    const db = this.workspaceDBService.userdataDB$.value;
    const raw = db.favorite.create({
      key: this.encodeKey(type, id),
      index,
    });
    return this.toRecord(raw) as FavoriteRecord;
  }

  reorderFavorite(type: FavoriteSupportTypeUnion, id: string, index: string) {
    const db = this.workspaceDBService.userdataDB$.value;
    db.favorite.update(this.encodeKey(type, id), { index });
  }

  removeFavorite(type: FavoriteSupportTypeUnion, id: string) {
    const db = this.workspaceDBService.userdataDB$.value;
    db.favorite.delete(this.encodeKey(type, id));
  }

  watchFavorite(type: FavoriteSupportTypeUnion, id: string) {
    const db = this.workspaceDBService.userdataDB$.value;
    return LiveData.from<FavoriteRecord | undefined>(
      db.favorite
        .get$(this.encodeKey(type, id))
        .pipe(map(data => (data ? this.toRecord(data) : undefined))),
      null as any
    );
  }

  private toRecord(data: {
    key: string;
    index: string;
  }): FavoriteRecord | undefined {
    const key = this.parseKey(data.key);
    if (!key) {
      return undefined;
    }
    return {
      type: key.type,
      id: key.id,
      index: data.index,
    };
  }

  /**
   * parse favorite key
   * key format: ${type}:${id}
   * type: collection | doc | tag
   * @returns null if key is invalid
   */
  private parseKey(key: string): {
    type: FavoriteSupportTypeUnion;
    id: string;
  } | null {
    const [type, id] = key.split(':');
    if (!type || !id) {
      return null;
    }
    if (!isFavoriteSupportType(type)) {
      return null;
    }
    return { type: type as FavoriteSupportTypeUnion, id };
  }

  private encodeKey(type: FavoriteSupportTypeUnion, id: string) {
    return `${type}:${id}`;
  }
}
