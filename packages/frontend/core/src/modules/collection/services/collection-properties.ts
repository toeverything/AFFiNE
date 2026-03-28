import { LiveData, Service } from '@toeverything/infra';

import type { ExplorerDisplayPreference } from '../../../components/explorer/types';
import type { CollectionPropertiesStore } from '../stores/collection-properties';

export class CollectionPropertiesService extends Service {
  constructor(
    private readonly collectionPropertiesStore: CollectionPropertiesStore
  ) {
    super();
  }

  getDisplayPreference(
    collectionId: string
  ): ExplorerDisplayPreference | undefined {
    return this.collectionPropertiesStore.getDisplayPreference(collectionId);
  }

  watchDisplayPreference$(
    collectionId: string
  ): LiveData<ExplorerDisplayPreference | undefined> {
    return LiveData.from(
      this.collectionPropertiesStore.watchDisplayPreference(collectionId),
      this.collectionPropertiesStore.getDisplayPreference(collectionId)
    );
  }

  setDisplayPreference(
    collectionId: string,
    pref: ExplorerDisplayPreference
  ): void {
    this.collectionPropertiesStore.setDisplayPreference(collectionId, pref);
  }

  deleteProperties(collectionId: string): void {
    this.collectionPropertiesStore.deleteProperties(collectionId);
  }
}
