import type { FeatureType } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';

export class UserFeatureStore extends Store {
  constructor(private readonly nbstoreService: NbstoreService) {
    super();
  }

  async getUserFeatures(signal: AbortSignal) {
    const data = await this.nbstoreService.realtime.request(
      'user.profile.get',
      {},
      { signal, timeoutMs: 10000 }
    );
    if (!data.user) return;
    return {
      userId: data.user.id,
      features: data.user.features as FeatureType[] | undefined,
    };
  }
}
