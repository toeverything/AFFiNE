import { DebugLogger } from '@affine/debug';
import type {
  RealtimeTopicEventOf,
  WorkspaceConfigSnapshot,
  WorkspaceInviteLinkSnapshot,
} from '@affine/realtime';
import { Entity, LiveData } from '@toeverything/infra';

import { RealtimeLiveQuery } from '../../cloud/realtime/live-query';
import type { WorkspaceService } from '../../workspace';
import type { WorkspaceShareSettingStore } from '../stores/share-setting';

const logger = new DebugLogger('affine:workspace-permission');
type InviteLink = WorkspaceInviteLinkSnapshot;

export class WorkspaceShareSetting extends Entity {
  enableAi$ = new LiveData<boolean | null>(null);
  enableSharing$ = new LiveData<boolean | null>(null);
  enableUrlPreview$ = new LiveData<boolean | null>(null);
  inviteLink$ = new LiveData<InviteLink | null>(null);
  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);
  private inviteLinkStarted = false;
  private inviteLinkExpireTimer?: ReturnType<typeof setTimeout>;
  private readonly configLiveQuery = new RealtimeLiveQuery<
    WorkspaceConfigSnapshot,
    RealtimeTopicEventOf<'workspace.config.changed'>
  >({
    request: signal => this.requestWorkspaceConfig(signal),
    subscribe: () =>
      this.store.subscribeWorkspaceConfig(this.workspaceService.workspace.id),
    applySnapshot: value => {
      this.error$.next(null);
      this.enableAi$.next(value.enableAi);
      this.enableSharing$.next(value.enableSharing);
      this.enableUrlPreview$.next(value.enableUrlPreview);
    },
    applyEvent: () => 'revalidate',
    onError: error => {
      logger.error('Failed to fetch workspace share settings', error);
      this.error$.setValue(error);
    },
  });
  private readonly inviteLinkLiveQuery = new RealtimeLiveQuery<
    InviteLink | null,
    RealtimeTopicEventOf<'workspace.invite-link.changed'>
  >({
    request: signal =>
      this.store.fetchInviteLink(this.workspaceService.workspace.id, signal),
    subscribe: () =>
      this.store.subscribeInviteLink(this.workspaceService.workspace.id),
    applySnapshot: value => {
      this.error$.next(null);
      this.inviteLink$.next(value);
      this.scheduleInviteLinkExpiry(value);
    },
    applyEvent: () => 'revalidate',
    onError: error => {
      logger.error('Failed to fetch workspace invite link', error);
      this.error$.setValue(error);
      this.inviteLinkLiveQuery.stop();
      this.inviteLinkStarted = false;
    },
  });

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: WorkspaceShareSettingStore
  ) {
    super();
    this.configLiveQuery.start();
  }

  revalidate = () => {
    this.configLiveQuery.revalidate();
  };

  revalidateInviteLink = () => {
    this.ensureInviteLinkStarted();
    this.inviteLinkLiveQuery.revalidate();
  };

  async waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    await this.isLoading$.waitFor(isLoading => !isLoading, signal);
  }

  async setEnableUrlPreview(enableUrlPreview: boolean) {
    await this.store.updateWorkspaceEnableUrlPreview(
      this.workspaceService.workspace.id,
      enableUrlPreview
    );
    await this.waitForRevalidation();
  }

  async setEnableSharing(enableSharing: boolean) {
    await this.store.updateWorkspaceEnableSharing(
      this.workspaceService.workspace.id,
      enableSharing
    );
    await this.waitForRevalidation();
  }

  async setEnableAi(enableAi: boolean) {
    await this.store.updateWorkspaceEnableAi(
      this.workspaceService.workspace.id,
      enableAi
    );
    await this.waitForRevalidation();
  }

  override dispose(): void {
    this.configLiveQuery.dispose();
    this.inviteLinkLiveQuery.dispose();
    this.clearInviteLinkExpireTimer();
  }

  private ensureInviteLinkStarted() {
    if (this.inviteLinkStarted) {
      return;
    }
    this.inviteLinkStarted = true;
    this.inviteLinkLiveQuery.start();
  }

  private scheduleInviteLinkExpiry(inviteLink: InviteLink | null) {
    this.clearInviteLinkExpireTimer();
    if (!inviteLink) {
      return;
    }
    const expireAt = new Date(inviteLink.expireTime).getTime();
    if (!Number.isFinite(expireAt)) {
      return;
    }
    const delay = expireAt - Date.now();
    if (delay <= 0) {
      this.inviteLink$.next(null);
      return;
    }
    this.inviteLinkExpireTimer = setTimeout(() => {
      this.inviteLink$.next(null);
    }, delay);
    this.inviteLinkExpireTimer.unref?.();
  }

  private clearInviteLinkExpireTimer() {
    if (this.inviteLinkExpireTimer) {
      clearTimeout(this.inviteLinkExpireTimer);
      this.inviteLinkExpireTimer = undefined;
    }
  }

  private async requestWorkspaceConfig(signal: AbortSignal) {
    this.isLoading$.setValue(true);
    try {
      return await this.store.fetchWorkspaceConfig(
        this.workspaceService.workspace.id,
        signal
      );
    } finally {
      this.isLoading$.setValue(false);
    }
  }
}
