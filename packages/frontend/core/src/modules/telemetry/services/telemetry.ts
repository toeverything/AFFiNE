import { mixpanel } from '@affine/core/utils';
import type { QuotaQuery } from '@affine/graphql';
import type { WorkspaceScope } from '@toeverything/infra';
import {
  ApplicationStarted,
  DocsService,
  OnEvent,
  Service,
} from '@toeverything/infra';

import {
  AccountChanged,
  type AuthAccountInfo,
  type AuthService,
} from '../../cloud';
import { AccountLoggedOut } from '../../cloud/services/auth';
import { UserQuotaChanged } from '../../cloud/services/user-quota';
import { resolveRouteLinkMeta } from '../../navigation';
import { WorkbenchService } from '../../workbench';

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(AccountChanged, e => e.updateIdentity)
@OnEvent(AccountLoggedOut, e => e.onAccountLoggedOut)
@OnEvent(UserQuotaChanged, e => e.onUserQuotaChanged)
export class TelemetryService extends Service {
  private prevQuota: NonNullable<QuotaQuery['currentUser']>['quota'] | null =
    null;

  constructor(private readonly auth: AuthService) {
    super();
  }

  onApplicationStart() {
    if (process.env.MIXPANEL_TOKEN) {
      mixpanel.init(process.env.MIXPANEL_TOKEN || '', {
        track_pageview: true,
        persistence: 'localStorage',
      });
      mixpanel.register({
        appVersion: runtimeConfig.appVersion,
        environment: runtimeConfig.appBuildType,
        editorVersion: runtimeConfig.editorVersion,
        isSelfHosted: Boolean(runtimeConfig.isSelfHosted),
        isDesktop: environment.isDesktop,
      });
    }
    const account = this.auth.session.account$.value;
    this.updateIdentity(account);
  }

  updateIdentity(account: AuthAccountInfo | null) {
    if (!account) {
      return;
    }
    mixpanel.identify(account.id);
    mixpanel.people.set({
      $email: account.email,
      $name: account.label,
      $avatar: account.avatar,
    });
  }

  onAccountLoggedOut() {
    mixpanel.reset();
  }

  onUserQuotaChanged(quota: NonNullable<QuotaQuery['currentUser']>['quota']) {
    const plan = quota?.humanReadable.name;
    // only set when plan is not empty and changed
    if (plan !== this.prevQuota?.humanReadable.name && plan) {
      mixpanel.people.set({
        plan: quota?.humanReadable.name,
      });
    }
    this.prevQuota = quota;
  }
}

// get telemetry related context in Workspace scope
export class TelemetryWorkspaceContextService extends Service {
  constructor(private readonly provider: WorkspaceScope) {
    super();
  }

  getPageContext() {
    const workbench = this.provider?.getOptional(WorkbenchService)?.workbench;
    const docs = this.provider?.getOptional(DocsService);

    if (!workbench || !docs) return '';

    const basename = workbench.basename$.value;
    const path = workbench.location$.value;
    const fullPath = basename + path.pathname + path.search + path.hash;
    const linkMeta = resolveRouteLinkMeta(fullPath);
    return (() => {
      const moduleName =
        linkMeta?.moduleName === 'doc'
          ? docs.list.getMode(linkMeta.docId)
          : linkMeta?.moduleName;
      switch (moduleName) {
        case 'page':
          return 'doc editor';
        case 'edgeless':
          return 'whiteboard editor';
        case 'trash':
          return 'trash';
        default:
          return 'doc library';
      }
    })();
  }
}
