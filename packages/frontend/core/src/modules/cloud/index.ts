export type { Invoice } from './entities/invoices';
export { Server } from './entities/server';
export type { AuthAccountInfo } from './entities/session';
export { AccountChanged } from './events/account-changed';
export { AccountLoggedIn } from './events/account-logged-in';
export { AccountLoggedOut } from './events/account-logged-out';
export { AuthProvider } from './provider/auth';
export { ValidatorProvider } from './provider/validator';
export { ServerScope } from './scopes/server';
export { AccessTokenService } from './services/access-token';
export { AuthService } from './services/auth';
export { CaptchaService } from './services/captcha';
export { DefaultServerService } from './services/default-server';
export { DocCreatedByUpdatedBySyncService } from './services/doc-created-by-updated-by-sync';
export { EventSourceService } from './services/eventsource';
export { FetchService } from './services/fetch';
export { GraphQLService } from './services/graphql';
export { InvitationService } from './services/invitation';
export { InvoicesService } from './services/invoices';
export type { PublicUserInfo } from './services/public-user';
export { PublicUserService } from './services/public-user';
export { SelfhostGenerateLicenseService } from './services/selfhost-generate-license';
export { SelfhostLicenseService } from './services/selfhost-license';
export { ServerService } from './services/server';
export { ServersService } from './services/servers';
export { SubscriptionService } from './services/subscription';
export { UserCopilotQuotaService } from './services/user-copilot-quota';
export { UserFeatureService } from './services/user-feature';
export { UserQuotaService } from './services/user-quota';
export {
  type UserSettings,
  UserSettingsService,
} from './services/user-settings';
export { WorkspaceInvoicesService } from './services/workspace-invoices';
export { WorkspaceServerService } from './services/workspace-server';
export { WorkspaceSubscriptionService } from './services/workspace-subscription';
export type { ServerConfig } from './types';

// eslint-disable-next-line simple-import-sort/imports
import { type Framework } from '@toeverything/infra';

import { GlobalCache, GlobalState } from '../storage/providers/global';
import { GlobalStateService } from '../storage/services/global';
import { UrlService } from '../url';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { CloudDocMeta } from './entities/cloud-doc-meta';
import { Invoices } from './entities/invoices';
import { Server } from './entities/server';
import { AuthSession } from './entities/session';
import { Subscription } from './entities/subscription';
import { SubscriptionPrices } from './entities/subscription-prices';
import { UserCopilotQuota } from './entities/user-copilot-quota';
import { UserFeature } from './entities/user-feature';
import { UserQuota } from './entities/user-quota';
import { WorkspaceInvoices } from './entities/workspace-invoices';
import { WorkspaceSubscription } from './entities/workspace-subscription';
import { configureDefaultAuthProvider } from './impl/auth';
import { AuthProvider } from './provider/auth';
import { ValidatorProvider } from './provider/validator';
import { ServerScope } from './scopes/server';
import { InvitationService } from './services/invitation';
import { AuthService } from './services/auth';
import { BlocksuiteWriterInfoService } from './services/blocksuite-writer-info';
import { CaptchaService } from './services/captcha';
import { CloudDocMetaService } from './services/cloud-doc-meta';
import { DefaultServerService } from './services/default-server';
import { EventSourceService } from './services/eventsource';
import { FetchService } from './services/fetch';
import { GraphQLService } from './services/graphql';
import { InvoicesService } from './services/invoices';
import { PublicUserService } from './services/public-user';
import { SelfhostGenerateLicenseService } from './services/selfhost-generate-license';
import { SelfhostLicenseService } from './services/selfhost-license';
import { ServerService } from './services/server';
import { ServersService } from './services/servers';
import { SubscriptionService } from './services/subscription';
import { UserCopilotQuotaService } from './services/user-copilot-quota';
import { UserFeatureService } from './services/user-feature';
import { UserQuotaService } from './services/user-quota';
import { UserSettingsService } from './services/user-settings';
import { WorkspaceInvoicesService } from './services/workspace-invoices';
import { WorkspaceServerService } from './services/workspace-server';
import { WorkspaceSubscriptionService } from './services/workspace-subscription';
import { AcceptInviteStore } from './stores/accept-invite';
import { AuthStore } from './stores/auth';
import { CloudDocMetaStore } from './stores/cloud-doc-meta';
import { InviteInfoStore } from './stores/invite-info';
import { InvoicesStore } from './stores/invoices';
import { PublicUserStore } from './stores/public-user';
import { SelfhostGenerateLicenseStore } from './stores/selfhost-generate-license';
import { SelfhostLicenseStore } from './stores/selfhost-license';
import { ServerConfigStore } from './stores/server-config';
import { ServerListStore } from './stores/server-list';
import { SubscriptionStore } from './stores/subscription';
import { UserCopilotQuotaStore } from './stores/user-copilot-quota';
import { UserFeatureStore } from './stores/user-feature';
import { UserQuotaStore } from './stores/user-quota';
import { UserSettingsStore } from './stores/user-settings';
import { DocCreatedByService } from './services/doc-created-by';
import { DocUpdatedByService } from './services/doc-updated-by';
import { DocCreatedByUpdatedBySyncService } from './services/doc-created-by-updated-by-sync';
import { WorkspacePermissionService } from '../permissions';
import { DocScope, DocService, DocsService } from '../doc';
import { DocCreatedByUpdatedBySyncStore } from './stores/doc-created-by-updated-by-sync';
import { GlobalDialogService } from '../dialogs';
import { AccessTokenService } from './services/access-token';
import { AccessTokenStore } from './stores/access-token';

export function configureCloudModule(framework: Framework) {
  configureDefaultAuthProvider(framework);

  framework
    .service(ServersService, [ServerListStore, ServerConfigStore])
    .service(DefaultServerService, [ServersService])
    .store(ServerListStore, [GlobalStateService])
    .store(ServerConfigStore)
    .entity(Server, [ServerListStore])
    .scope(ServerScope)
    .service(ServerService, [ServerScope])
    .service(FetchService, [ServerService])
    .service(EventSourceService, [ServerService])
    .service(GraphQLService, [FetchService])
    .service(CaptchaService, f => {
      return new CaptchaService(
        f.get(ServerService),
        f.get(FetchService),
        f.getOptional(ValidatorProvider)
      );
    })
    .service(AuthService, [
      FetchService,
      AuthStore,
      UrlService,
      GlobalDialogService,
    ])
    .store(AuthStore, [
      FetchService,
      GraphQLService,
      GlobalState,
      ServerService,
      AuthProvider,
    ])
    .entity(AuthSession, [AuthStore])
    .service(SubscriptionService, [SubscriptionStore])
    .store(SubscriptionStore, [
      GraphQLService,
      GlobalCache,
      UrlService,
      ServerService,
    ])
    .entity(Subscription, [AuthService, ServerService, SubscriptionStore])
    .entity(SubscriptionPrices, [ServerService, SubscriptionStore])
    .service(UserQuotaService)
    .store(UserQuotaStore, [GraphQLService])
    .entity(UserQuota, [AuthService, UserQuotaStore])
    .service(UserCopilotQuotaService)
    .store(UserCopilotQuotaStore, [GraphQLService])
    .entity(UserCopilotQuota, [
      AuthService,
      UserCopilotQuotaStore,
      ServerService,
    ])
    .service(UserFeatureService)
    .entity(UserFeature, [AuthService, UserFeatureStore])
    .store(UserFeatureStore, [GraphQLService])
    .service(InvoicesService)
    .store(InvoicesStore, [GraphQLService])
    .entity(Invoices, [InvoicesStore])
    .service(SelfhostGenerateLicenseService, [SelfhostGenerateLicenseStore])
    .store(SelfhostGenerateLicenseStore, [GraphQLService])
    .store(InviteInfoStore, [GraphQLService])
    .service(InvitationService, [AcceptInviteStore, InviteInfoStore])
    .store(AcceptInviteStore, [GraphQLService])
    .service(PublicUserService, [PublicUserStore])
    .store(PublicUserStore, [GraphQLService])
    .service(UserSettingsService, [UserSettingsStore])
    .store(UserSettingsStore, [GraphQLService])
    .service(AccessTokenService, [AccessTokenStore])
    .store(AccessTokenStore, [GraphQLService]);

  framework
    .scope(WorkspaceScope)
    .service(WorkspaceServerService)
    .service(DocCreatedByService, [WorkspaceServerService])
    .scope(DocScope)
    .service(DocUpdatedByService, [WorkspaceServerService])
    .service(CloudDocMetaService)
    .entity(CloudDocMeta, [CloudDocMetaStore, DocService, GlobalCache])
    .store(CloudDocMetaStore, [WorkspaceServerService]);
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceSubscriptionService, [WorkspaceServerService])
    .entity(WorkspaceSubscription, [WorkspaceService, WorkspaceServerService])
    .service(WorkspaceInvoicesService)
    .entity(WorkspaceInvoices, [WorkspaceService, WorkspaceServerService])
    .service(SelfhostLicenseService, [SelfhostLicenseStore, WorkspaceService])
    .store(SelfhostLicenseStore, [WorkspaceServerService])
    .service(BlocksuiteWriterInfoService, [WorkspaceServerService])
    .service(DocCreatedByUpdatedBySyncService, [
      WorkspaceService,
      DocsService,
      WorkspacePermissionService,
      DocCreatedByUpdatedBySyncStore,
    ])
    .store(DocCreatedByUpdatedBySyncStore, [
      WorkspaceServerService,
      WorkspaceService,
    ]);
}
