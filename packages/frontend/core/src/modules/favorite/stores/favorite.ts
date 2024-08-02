import { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceDBService, WorkspaceService } from '@toeverything/infra';
import { LiveData, Store } from '@toeverything/infra';
import { map } from 'rxjs';

import type { AuthService } from '../../cloud';
import type { FavoriteSupportType } from '../constant';
import { isFavoriteSupportType } from '../constant';

export interface FavoriteRecord {
  type: FavoriteSupportType;
  id: string;
  index: string;
}

export class FavoriteStore extends Store {
  constructor(
    private readonly authService: AuthService,
    private readonly workspaceDBService: WorkspaceDBService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  private get userdataDB$() {
    return this.authService.session.account$.map(account => {
      // if is local workspace or no account, use __local__ userdata
      // sometimes we may have cloud workspace but no account for a short time, we also use __local__ userdata
      if (
        this.workspaceService.workspace.meta.flavour ===
          WorkspaceFlavour.LOCAL ||
        !account
      ) {
        return this.workspaceDBService.userdataDB('__local__');
      }
      return this.workspaceDBService.userdataDB(account.id);
    });
  }

  watchIsLoading() {
    return this.userdataDB$
      .map(db => LiveData.from(db.favorite.isLoading$, false))
      .flat();
  }

  watchFavorites() {
    return this.userdataDB$
      .map(db => LiveData.from(db.favorite.find$(), []))
      .flat()
      .map(raw => {
        return raw
          .map(data => this.toRecord(data))
          .filter((record): record is FavoriteRecord => !!record);
      });
  }

  addFavorite(
    type: FavoriteSupportType,
    id: string,
    index: string
  ): FavoriteRecord {
    const db = this.userdataDB$.value;
    const raw = db.favorite.create({
      key: this.encodeKey(type, id),
      index,
    });
    return this.toRecord(raw) as FavoriteRecord;
  }

  reorderFavorite(type: FavoriteSupportType, id: string, index: string) {
    const db = this.userdataDB$.value;
    db.favorite.update(this.encodeKey(type, id), { index });
  }

  removeFavorite(type: FavoriteSupportType, id: string) {
    const db = this.userdataDB$.value;
    db.favorite.delete(this.encodeKey(type, id));
  }

  watchFavorite(type: FavoriteSupportType, id: string) {
    const db = this.userdataDB$.value;
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
    type: FavoriteSupportType;
    id: string;
  } | null {
    const [type, id] = key.split(':');
    if (!type || !id) {
      return null;
    }
    if (!isFavoriteSupportType(type)) {
      return null;
    }
    return { type: type as FavoriteSupportType, id };
  }

  private encodeKey(type: FavoriteSupportType, id: string) {
    return `${type}:${id}`;
  }
}
