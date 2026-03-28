import { Store } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { ExplorerDisplayPreference } from '../../../components/explorer/types';
import type { WorkspaceDBService } from '../../db';

export class CollectionPropertiesStore extends Store {
  constructor(private readonly workspaceDBService: WorkspaceDBService) {
    super();
  }

  getDisplayPreference(
    collectionId: string
  ): ExplorerDisplayPreference | undefined {
    const record =
      this.workspaceDBService.db.collectionProperties.get(collectionId);
    return record?.displayPreference as ExplorerDisplayPreference | undefined;
  }

  watchDisplayPreference(
    collectionId: string
  ): Observable<ExplorerDisplayPreference | undefined> {
    return this.workspaceDBService.db.collectionProperties
      .get$(collectionId)
      .pipe(
        map(
          record =>
            record?.displayPreference as ExplorerDisplayPreference | undefined
        )
      );
  }

  setDisplayPreference(
    collectionId: string,
    pref: ExplorerDisplayPreference
  ): void {
    const existing =
      this.workspaceDBService.db.collectionProperties.get(collectionId);
    if (existing) {
      this.workspaceDBService.db.collectionProperties.update(collectionId, {
        displayPreference: pref,
      });
    } else {
      this.workspaceDBService.db.collectionProperties.create({
        id: collectionId,
        displayPreference: pref,
      });
    }
  }

  deleteProperties(collectionId: string): void {
    this.workspaceDBService.db.collectionProperties.delete(collectionId);
  }
}
