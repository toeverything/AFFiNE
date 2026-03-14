import type {
  Permission,
  ResendWorkspaceTeamMemberInviteMutation,
  WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { LiveData, Service } from '@toeverything/infra';

import type { GlobalStateService } from '../../storage';
import type { WorkspaceService } from '../../workspace';
import { WorkspaceMembers } from '../entities/members';
import type { WorkspaceMembersStore } from '../stores/members';

const RESEND_MEMBER_INVITE_BACKOFF_KEY = 'workspace-member-resend-backoff-v1';
const RESEND_MEMBER_INVITE_BACKOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ResendMemberInviteResult =
  ResendWorkspaceTeamMemberInviteMutation['resendMemberInvite'];

type ResendMemberInviteBackoffState = {
  attempt: number;
  nextAllowedAt: number;
  updatedAt: number;
};

export class WorkspaceMembersService extends Service {
  constructor(
    private readonly store: WorkspaceMembersStore,
    private readonly workspaceService: WorkspaceService,
    private readonly globalStateService: GlobalStateService
  ) {
    super();
  }

  members = this.framework.createEntity(WorkspaceMembers);

  readonly resendMemberInviteBackoff$ = LiveData.from(
    this.globalStateService.globalState.watch<
      Record<string, ResendMemberInviteBackoffState>
    >(RESEND_MEMBER_INVITE_BACKOFF_KEY),
    {}
  );

  private get resendMemberInviteBackoffStore() {
    return this.resendMemberInviteBackoff$.value ?? {};
  }

  private setResendMemberInviteBackoffStore(
    store: Record<string, ResendMemberInviteBackoffState>
  ) {
    this.globalStateService.globalState.set(
      RESEND_MEMBER_INVITE_BACKOFF_KEY,
      store
    );
  }

  private getMemberResendInviteBackoffKey(email: string) {
    return `${this.workspaceService.workspace.id}:${email.trim().toLowerCase()}`;
  }

  private syncResendMemberInviteBackoff(
    email: string,
    result: ResendMemberInviteResult
  ) {
    const parsedNextAllowedAt = new Date(result.nextAllowedAt).getTime();
    const nextAllowedAt = Number.isNaN(parsedNextAllowedAt)
      ? Date.now() + result.retryAfterMs
      : parsedNextAllowedAt;
    const key = this.getMemberResendInviteBackoffKey(email);
    const now = Date.now();
    const latestStore = this.resendMemberInviteBackoffStore;
    console.log('latestStoreeeeeeeee: ', latestStore);
    const nextStore = Object.fromEntries(
      Object.entries(latestStore).filter(
        ([, value]) =>
          now - value.updatedAt < RESEND_MEMBER_INVITE_BACKOFF_TTL_MS
      )
    );

    nextStore[key] = {
      attempt: result.attempt,
      nextAllowedAt,
      updatedAt: now,
    };
    this.setResendMemberInviteBackoffStore(nextStore);
  }

  getMemberResendInviteRetryAfterMs(email?: string, now: number = Date.now()) {
    if (!email) {
      return 0;
    }
    const key = this.getMemberResendInviteBackoffKey(email);
    const latest = this.resendMemberInviteBackoffStore[key];
    if (!latest) {
      return 0;
    }
    return Math.max(latest.nextAllowedAt - now, 0);
  }

  async inviteMembers(emails: string[]) {
    return await this.store.inviteBatch(
      this.workspaceService.workspace.id,
      emails
    );
  }

  async generateInviteLink(expireTime: WorkspaceInviteLinkExpireTime) {
    return await this.store.generateInviteLink(
      this.workspaceService.workspace.id,
      expireTime
    );
  }

  async revokeInviteLink() {
    return await this.store.revokeInviteLink(
      this.workspaceService.workspace.id
    );
  }

  async revokeMember(userId: string) {
    return await this.store.revokeMemberPermission(
      this.workspaceService.workspace.id,
      userId
    );
  }

  async approveMember(userId: string) {
    return await this.store.approveMember(
      this.workspaceService.workspace.id,
      userId
    );
  }

  async adjustMemberPermission(userId: string, permission: Permission) {
    return await this.store.adjustMemberPermission(
      this.workspaceService.workspace.id,
      userId,
      permission
    );
  }

  async resendMemberInvite(inviteId: string, email: string) {
    const result = await this.store.resendMemberInvite(
      this.workspaceService.workspace.id,
      inviteId
    );
    this.syncResendMemberInviteBackoff(email, result);
    return result;
  }
}
