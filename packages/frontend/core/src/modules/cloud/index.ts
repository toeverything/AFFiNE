export type { AuthAccountInfo } from './entities/session';
export {
  BackendError,
  isBackendError,
  isNetworkError,
  NetworkError,
} from './error';
export { AccountChanged, AuthService } from './services/auth';
export { FetchService } from './services/fetch';
export { GraphQLService } from './services/graphql';
export { ServerConfigService } from './services/server-config';
export { SubscriptionService } from './services/subscription';
export { UserQuotaService } from './services/user-quota';

import {
  type Framework,
  GlobalCacheService,
  GlobalStateService,
} from '@toeverything/infra';

import { ServerConfig } from './entities/server-config';
import { AuthSession } from './entities/session';
import { Subscription } from './entities/subscription';
import { SubscriptionPrices } from './entities/subscription-prices';
import { UserQuota } from './entities/user-quota';
import { AuthService } from './services/auth';
import { AuthStoreService } from './services/auth-store';
import { FetchService } from './services/fetch';
import { GraphQLService } from './services/graphql';
import { ServerConfigService } from './services/server-config';
import { ServerConfigStoreService } from './services/server-config-store';
import { SubscriptionService } from './services/subscription';
import { SubscriptionStoreService } from './services/subscription-store';
import { UserQuotaService } from './services/user-quota';
import { UserQuotaStoreService } from './services/user-quota-store';

export function configureCloudModule(framework: Framework) {
  framework
    .service(FetchService)
    .service(GraphQLService, [FetchService])
    .service(ServerConfigService)
    .entity(ServerConfig, [ServerConfigStoreService])
    .service(ServerConfigStoreService, [GraphQLService])
    .service(AuthService, [FetchService, AuthStoreService])
    .service(AuthStoreService, [
      FetchService,
      GraphQLService,
      GlobalStateService,
    ])
    .entity(AuthSession, [AuthStoreService])
    .service(SubscriptionService, [SubscriptionStoreService])
    .service(SubscriptionStoreService, [GraphQLService, GlobalCacheService])
    .entity(Subscription, [
      AuthService,
      ServerConfigService,
      SubscriptionStoreService,
    ])
    .entity(SubscriptionPrices, [ServerConfigService, SubscriptionStoreService])
    .service(UserQuotaService)
    .service(UserQuotaStoreService, [GraphQLService])
    .entity(UserQuota, [UserQuotaStoreService]);
}
