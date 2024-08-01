import { mixpanel } from '@affine/core/mixpanel';
import type { QuotaQuery } from '@affine/graphql';
import type { GlobalContextService } from '@toeverything/infra';
import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';

import {
  AccountChanged,
  type AuthAccountInfo,
  type AuthService,
} from '../../cloud';
import { AccountLoggedOut } from '../../cloud/services/auth';
import { UserQuotaChanged } from '../../cloud/services/user-quota';

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(AccountChanged, e => e.updateIdentity)
@OnEvent(AccountLoggedOut, e => e.onAccountLoggedOut)
@OnEvent(UserQuotaChanged, e => e.onUserQuotaChanged)
export class TelemetryService extends Service {
  private prevQuota: NonNullable<QuotaQuery['currentUser']>['quota'] | null =
    null;
  private readonly disposables: (() => void)[] = [];

  constructor(
    private readonly auth: AuthService,
    private readonly globalContextService: GlobalContextService
  ) {
    super();
  }

  onApplicationStart() {
    const account = this.auth.session.account$.value;
    this.updateIdentity(account);
    this.registerMiddlewares();
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

  registerMiddlewares() {
    this.disposables.push(
      mixpanel.middleware((_event, parameters) => {
        const extraContext = this.extractGlobalContext();
        return {
          ...extraContext,
          ...parameters,
        };
      })
    );
  }

  extractGlobalContext() {
    const globalContext = this.globalContextService.globalContext;
    const page = globalContext.isDoc.get()
      ? globalContext.isTrashDoc.get()
        ? 'trash'
        : globalContext.docMode.get() === 'page'
          ? 'doc editor'
          : 'whiteboard editor'
      : globalContext.isAllDocs.get()
        ? 'doc library'
        : globalContext.isTrash.get()
          ? 'trash library'
          : globalContext.isCollection.get()
            ? 'collection detail'
            : globalContext.isTag.get()
              ? 'tag detail'
              : 'unknown';
    return { page, activePage: page };
  }

  override dispose(): void {
    this.disposables.forEach(dispose => dispose());
    super.dispose();
  }
}
