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
export { UserCopilotQuotaService } from './services/user-copilot-quota';
export { UserFeatureService } from './services/user-feature';
export { UserQuotaService } from './services/user-quota';
export { WebSocketService } from './services/websocket';

import {
  type Framework,
  GlobalCacheService,
  GlobalStateService,
} from '@toeverything/infra';

import { ServerConfig } from './entities/server-config';
import { AuthSession } from './entities/session';
import { Subscription } from './entities/subscription';
import { SubscriptionPrices } from './entities/subscription-prices';
import { UserCopilotQuota } from './entities/user-copilot-quota';
import { UserFeature } from './entities/user-feature';
import { UserQuota } from './entities/user-quota';
import { AuthService } from './services/auth';
import { FetchService } from './services/fetch';
import { GraphQLService } from './services/graphql';
import { ServerConfigService } from './services/server-config';
import { SubscriptionService } from './services/subscription';
import { UserCopilotQuotaService } from './services/user-copilot-quota';
import { UserFeatureService } from './services/user-feature';
import { UserQuotaService } from './services/user-quota';
import { WebSocketService } from './services/websocket';
import { AuthStore } from './stores/auth';
import { ServerConfigStore } from './stores/server-config';
import { SubscriptionStore } from './stores/subscription';
import { UserCopilotQuotaStore } from './stores/user-copilot-quota';
import { UserFeatureStore } from './stores/user-feature';
import { UserQuotaStore } from './stores/user-quota';

export function configureCloudModule(framework: Framework) {
  framework
    .service(FetchService)
    .service(GraphQLService, [FetchService])
    .service(WebSocketService)
    .service(ServerConfigService)
    .entity(ServerConfig, [ServerConfigStore])
    .store(ServerConfigStore, [GraphQLService])
    .service(AuthService, [FetchService, AuthStore])
    .store(AuthStore, [FetchService, GraphQLService, GlobalStateService])
    .entity(AuthSession, [AuthStore])
    .service(SubscriptionService, [SubscriptionStore])
    .store(SubscriptionStore, [GraphQLService, GlobalCacheService])
    .entity(Subscription, [AuthService, ServerConfigService, SubscriptionStore])
    .entity(SubscriptionPrices, [ServerConfigService, SubscriptionStore])
    .service(UserQuotaService)
    .store(UserQuotaStore, [GraphQLService])
    .entity(UserQuota, [AuthService, UserQuotaStore])
    .service(UserCopilotQuotaService)
    .store(UserCopilotQuotaStore, [GraphQLService])
    .entity(UserCopilotQuota, [
      AuthService,
      UserCopilotQuotaStore,
      ServerConfigService,
    ])
    .service(UserFeatureService)
    .entity(UserFeature, [AuthService, UserFeatureStore])
    .store(UserFeatureStore, [GraphQLService]);
}
