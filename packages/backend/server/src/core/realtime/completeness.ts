import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { Flavor } from '../../env';
import { RealtimeRegistry } from './registry';
import {
  REALTIME_GATEWAY_REQUIRED_REQUESTS,
  REALTIME_GATEWAY_REQUIRED_TOPICS,
} from './required-handlers';

@Injectable()
export class RealtimeRegistryCompletenessChecker implements OnApplicationBootstrap {
  constructor(private readonly registry: RealtimeRegistry) {}

  onApplicationBootstrap() {
    if (
      globalThis.env.FLAVOR !== Flavor.Front &&
      globalThis.env.FLAVOR !== Flavor.Sync
    ) {
      return;
    }

    const missingRequests = REALTIME_GATEWAY_REQUIRED_REQUESTS.filter(
      name => !this.registry.hasRequest(name)
    );
    const missingTopics = REALTIME_GATEWAY_REQUIRED_TOPICS.filter(
      name => !this.registry.hasTopic(name)
    );

    if (missingRequests.length || missingTopics.length) {
      throw new Error(
        [
          'Realtime gateway missing handlers.',
          missingRequests.length
            ? `requests: ${missingRequests.join(', ')}.`
            : null,
          missingTopics.length ? `topics: ${missingTopics.join(', ')}.` : null,
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
  }
}
