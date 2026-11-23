import { DebugLogger } from '@affine/debug';
import type {
  RealtimeTopicEventOf,
  WorkspaceQuotaStateSnapshot,
} from '@affine/realtime';
import { Entity, LiveData } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import bytes from 'bytes';

import { RealtimeLiveQuery } from '../../cloud/realtime/live-query';
import type { WorkspaceService } from '../../workspace';
import type { WorkspaceQuotaStore } from '../stores/quota';

type QuotaType = {
  name: string;
  blobLimit: number;
  storageQuota: number;
  usedStorageQuota: number;
  historyPeriod: number;
  memberLimit: number;
  memberCount: number;
  overcapacityMemberCount: number;
  humanReadable: {
    name: string;
    blobLimit: string;
    storageQuota: string;
    historyPeriod: string;
    memberLimit: string;
    memberCount: string;
    overcapacityMemberCount: string;
  };
};

const logger = new DebugLogger('affine:workspace-permission');
const DAY_SECONDS = 24 * 60 * 60;

function formatSize(size: number) {
  return size === 0 ? '0 B' : (bytes.format(size) ?? '0 B');
}

function formatHistoryPeriod(value: number) {
  return `${(value / DAY_SECONDS).toFixed(0)} days`;
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
    case 'team':
    case 'selfhost_team':
      return 'Team';
    default:
      return 'Free';
  }
}

function workspaceQuotaFromState(
  state: WorkspaceQuotaStateSnapshot
): QuotaType {
  const name = planName(state.plan);
  return {
    name,
    blobLimit: state.blobLimit,
    storageQuota: state.storageQuota,
    usedStorageQuota: state.usedStorageQuota,
    historyPeriod: state.historyPeriodSeconds,
    memberLimit: state.seatLimit,
    memberCount: state.memberCount,
    overcapacityMemberCount: state.overcapacityMemberCount,
    humanReadable: {
      name,
      blobLimit: formatSize(state.blobLimit),
      storageQuota: formatSize(state.storageQuota),
      historyPeriod: formatHistoryPeriod(state.historyPeriodSeconds),
      memberLimit: state.seatLimit.toString(),
      memberCount: state.memberCount.toString(),
      overcapacityMemberCount: state.overcapacityMemberCount.toString(),
    },
  };
}

export class WorkspaceQuota extends Entity {
  quota$ = new LiveData<QuotaType | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any>(null);
  private started = false;
  private readonly liveQuery = new RealtimeLiveQuery<
    QuotaType,
    RealtimeTopicEventOf<'workspace.quota-state.changed'>
  >({
    request: signal => this.requestQuota(signal),
    subscribe: () =>
      this.store.subscribeWorkspaceQuotaState(
        this.workspaceService.workspace.id
      ),
    applySnapshot: quota => this.applyQuota(quota),
    applyEvent: () => 'revalidate',
    onError: error => this.handleError(error),
  });

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
        ? cssVarV2('status/error')
        : cssVarV2('toast/iconState/regular')
      : null
  );

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: WorkspaceQuotaStore
  ) {
    super();
  }

  revalidate = () => {
    if (!this.started) {
      this.started = true;
      this.liveQuery.start();
    }
    this.liveQuery.revalidate();
  };

  waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    return this.isRevalidating$.waitFor(
      isRevalidating => !isRevalidating,
      signal
    );
  }

  reset() {
    this.quota$.next(null);
    this.used$.next(null);
    this.error$.next(null);
    this.isRevalidating$.next(false);
  }

  override dispose(): void {
    this.liveQuery.dispose();
  }

  private applyQuota(quota: QuotaType | null) {
    this.error$.next(null);
    this.quota$.next(quota);
    this.used$.next(quota?.usedStorageQuota ?? null);
  }

  private handleError(error: unknown) {
    logger.error('Failed to fetch workspace quota', error);
    this.error$.next(error);
  }

  private async requestQuota(signal: AbortSignal) {
    this.isRevalidating$.setValue(true);
    try {
      return workspaceQuotaFromState(
        await this.store.fetchWorkspaceQuotaState(
          this.workspaceService.workspace.id,
          signal
        )
      );
    } finally {
      this.isRevalidating$.setValue(false);
    }
  }
}
