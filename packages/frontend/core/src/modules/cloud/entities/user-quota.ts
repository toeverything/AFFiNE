import type {
  RealtimeTopicEventOf,
  UserQuotaStateSnapshot,
} from '@affine/realtime';
import { Entity, LiveData } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import bytes from 'bytes';

import { RealtimeLiveQuery } from '../realtime/live-query';
import type { AuthService } from '../services/auth';
import type { UserQuotaStore } from '../stores/user-quota';

type QuotaType = {
  name: string;
  blobLimit: number;
  storageQuota: number;
  historyPeriod: number;
  memberLimit: number;
  humanReadable: {
    name: string;
    blobLimit: string;
    storageQuota: string;
    historyPeriod: string;
    memberLimit: string;
  };
};

const DAY_SECONDS = 24 * 60 * 60;

function formatSize(size: number) {
  return size === 0 ? '0 B' : (bytes.format(size) ?? '0 B');
}

function formatHistoryPeriod(value: number) {
  return `${(value / DAY_SECONDS).toFixed(0)} days`;
}

function userMemberLimit(plan: string) {
  return plan === 'pro' || plan === 'lifetime_pro' || plan === 'selfhost_free'
    ? 10
    : 3;
}

function planName(plan: string) {
  switch (plan) {
    case 'pro':
    case 'selfhost_free':
      return 'Pro';
    case 'lifetime_pro':
      return 'Lifetime Pro';
    case 'ai':
      return 'AI';
    default:
      return 'Free';
  }
}

function userQuotaFromState(state: UserQuotaStateSnapshot): QuotaType {
  const name = planName(state.plan);
  const memberLimit = userMemberLimit(state.plan);
  return {
    name,
    blobLimit: state.blobLimit,
    storageQuota: state.storageQuota,
    historyPeriod: state.historyPeriodSeconds,
    memberLimit,
    humanReadable: {
      name,
      blobLimit: formatSize(state.blobLimit),
      storageQuota: formatSize(state.storageQuota),
      historyPeriod: formatHistoryPeriod(state.historyPeriodSeconds),
      memberLimit: memberLimit.toString(),
    },
  };
}

export class UserQuota extends Entity {
  quota$ = new LiveData<QuotaType | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  /** Used storage in bytes */
  used$ = new LiveData<number | null>(null);
  /** Formatted used storage */
  usedFormatted$ = this.used$.map(used =>
    used !== null ? bytes.format(used) : null
  );
  /** Maximum storage limit in bytes */
  max$ = this.quota$.map(quota => (quota ? quota.storageQuota : null));
  /** Maximum storage limit formatted */
  maxFormatted$ = this.max$.map(max => (max ? bytes.format(max) : null));

  /** Percentage of storage used */
  percent$ = LiveData.computed(get => {
    const max = get(this.max$);
    const used = get(this.used$);
    if (max === null || used === null) {
      return null;
    }
    return Math.min(
      100,
      Math.max(0.5, Number(((used / max) * 100).toFixed(4)))
    );
  });

  color$ = this.percent$.map(percent =>
    percent !== null
      ? percent > 80
        ? cssVarV2('toast/iconState/error')
        : cssVarV2('toast/iconState/regular')
      : null
  );

  private started = false;
  private readonly liveQuery = new RealtimeLiveQuery<
    { quota: QuotaType; used: number },
    RealtimeTopicEventOf<'user.quota-state.changed'>
  >({
    request: signal => this.requestQuota(signal),
    subscribe: () => this.store.subscribeUserQuotaState(),
    applySnapshot: data => this.applyQuota(data.quota, data.used),
    applyEvent: () => 'revalidate',
    onError: error => this.error$.next(error),
  });

  constructor(
    private readonly authService: AuthService,
    private readonly store: UserQuotaStore
  ) {
    super();
  }

  revalidate = () => {
    if (!this.authService.session.account$.value?.id) {
      this.liveQuery.stop();
      this.started = false;
      this.reset();
      return;
    }
    if (!this.started) {
      this.started = true;
      this.liveQuery.start();
    }
    this.liveQuery.revalidate();
  };

  reset() {
    this.quota$.next(null);
    this.used$.next(null);
    this.error$.next(null);
    this.isRevalidating$.next(false);
  }

  override dispose(): void {
    this.liveQuery.dispose();
  }

  private applyQuota(quota: QuotaType | null, used: number | null) {
    this.error$.next(null);
    this.quota$.next(quota);
    this.used$.next(used);
  }

  private async requestQuota(signal: AbortSignal) {
    this.isRevalidating$.setValue(true);
    try {
      const state = await this.store.fetchUserQuotaState(signal);
      return {
        quota: userQuotaFromState(state),
        used: state.usedStorageQuota,
      };
    } finally {
      this.isRevalidating$.setValue(false);
    }
  }
}
