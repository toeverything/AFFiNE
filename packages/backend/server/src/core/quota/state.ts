import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { EventBus, OnEvent } from '../../base';
import { EntitlementService } from '../entitlement';

type Quota = Awaited<
  ReturnType<EntitlementService['resolveUserEntitlement']>
>['quota'];

const STATE_TTL = 1000 * 60 * 10;

declare global {
  interface Events {
    'user.quota_state.changed': {
      userId: string;
    };
    'workspace.quota_state.changed': {
      workspaceId: string;
    };
  }
}

@Injectable()
export class QuotaStateService {
  constructor(
    private readonly db: PrismaClient,
    private readonly entitlement: EntitlementService,
    private readonly event: EventBus
  ) {}

  async reconcileUserQuotaState(userId: string) {
    const [previous, entitlement, entitlements, resolved, usedStorageQuota] =
      await Promise.all([
        this.db.effectiveUserQuotaState.findUnique({ where: { userId } }),
        this.entitlement.getBestEntitlement('user', userId),
        this.entitlement.getActiveEntitlements('user', userId),
        this.entitlement.resolveUserEntitlement(userId),
        this.getOwnerStorageUsage(userId),
      ]);
    const flags = {
      ...resolved.flags,
      unlimitedCopilot: entitlements.some(
        entitlement => entitlement.plan === 'ai'
      ),
    };
    const now = new Date();

    const state = await this.db.effectiveUserQuotaState.upsert({
      where: { userId },
      update: {
        plan: resolved.plan,
        sourceEntitlementId: entitlement?.id ?? null,
        ...this.quotaData(resolved.quota),
        usedStorageQuota,
        flags,
        known: true,
        stale: false,
        lastReconciledAt: now,
        staleAfter: this.staleAfter(now),
      },
      create: {
        userId,
        plan: resolved.plan,
        sourceEntitlementId: entitlement?.id ?? null,
        ...this.quotaData(resolved.quota),
        usedStorageQuota,
        flags,
        known: true,
        stale: false,
        lastReconciledAt: now,
        staleAfter: this.staleAfter(now),
      },
    });
    if (this.userQuotaStateChanged(previous, state)) {
      await this.event.emitAsync('user.quota_state.changed', { userId });
    }
    return state;
  }

  async reconcileWorkspaceQuotaState(workspaceId: string) {
    const owner = await this.getWorkspaceOwner(workspaceId);
    const [
      previous,
      entitlement,
      resolved,
      memberCount,
      workspaceStorageUsage,
    ] = await Promise.all([
      this.db.effectiveWorkspaceQuotaState.findUnique({
        where: { workspaceId },
      }),
      this.entitlement.getBestEntitlement('workspace', workspaceId),
      this.entitlement.resolveWorkspaceEntitlement(workspaceId),
      this.getChargedMemberCount(workspaceId),
      this.getWorkspaceStorageUsage(workspaceId),
    ]);
    const usesOwnerQuota = !this.hasStandaloneWorkspaceQuota(resolved.plan);
    const [ownerState, ownerEntitlement] = usesOwnerQuota
      ? await Promise.all([
          this.reconcileUserQuotaState(owner.id),
          this.entitlement.resolveUserEntitlement(owner.id),
        ])
      : [null, null];
    const quota = ownerEntitlement?.quota ?? resolved.quota;
    const plan = ownerEntitlement?.plan ?? resolved.plan;
    const usedStorageQuota = ownerState
      ? ownerState.usedStorageQuota
      : workspaceStorageUsage;
    const storageQuota = BigInt(quota.storageQuota);
    const seatLimit = quota.seatLimit ?? 0;
    const overcapacityMemberCount = Math.max(memberCount - seatLimit, 0);
    const readonlyReasons = [
      overcapacityMemberCount > 0 ? 'member_overflow' : null,
      usedStorageQuota > storageQuota ? 'storage_overflow' : null,
    ].filter((reason): reason is string => !!reason);
    const now = new Date();

    const state = await this.db.effectiveWorkspaceQuotaState.upsert({
      where: { workspaceId },
      update: {
        plan,
        sourceEntitlementId: entitlement?.id ?? null,
        ownerUserId: owner.id,
        usesOwnerQuota,
        seatLimit,
        memberCount,
        overcapacityMemberCount,
        ...this.workspaceQuotaData(quota),
        usedStorageQuota,
        readonly: readonlyReasons.length > 0,
        readonlyReasons,
        flags: resolved.flags,
        known: true,
        stale: false,
        lastReconciledAt: now,
        staleAfter: this.staleAfter(now),
      },
      create: {
        workspaceId,
        plan,
        sourceEntitlementId: entitlement?.id ?? null,
        ownerUserId: owner.id,
        usesOwnerQuota,
        seatLimit,
        memberCount,
        overcapacityMemberCount,
        ...this.workspaceQuotaData(quota),
        usedStorageQuota,
        readonly: readonlyReasons.length > 0,
        readonlyReasons,
        flags: resolved.flags,
        known: true,
        stale: false,
        lastReconciledAt: now,
        staleAfter: this.staleAfter(now),
      },
    });
    if (this.workspaceQuotaStateChanged(previous, state)) {
      await this.event.emitAsync('workspace.quota_state.changed', {
        workspaceId,
      });
    }
    return state;
  }

  async reconcileAllEntitlementProjection() {
    const [users, workspaces] = await Promise.all([
      this.db.user.findMany({ select: { id: true } }),
      this.db.workspace.findMany({ select: { id: true } }),
    ]);

    await this.reconcileMany([
      ...users.map(user => () => this.reconcileUserQuotaState(user.id)),
      ...workspaces.map(
        workspace => () => this.reconcileWorkspaceQuotaState(workspace.id)
      ),
    ]);
  }

  @OnEvent('entitlement.changed')
  async onEntitlementChanged({
    targetType,
    targetId,
  }: Events['entitlement.changed']) {
    if (targetType === 'user') {
      await this.reconcileUserQuotaState(targetId);
      await this.reconcileOwnedWorkspaces(targetId);
    } else if (targetType === 'workspace') {
      await this.reconcileWorkspaceQuotaState(targetId);
    }
  }

  @OnEvent('workspace.members.updated')
  async onWorkspaceMembersUpdated({
    workspaceId,
  }: Events['workspace.members.updated']) {
    await this.reconcileWorkspaceQuotaState(workspaceId);
  }

  @OnEvent('workspace.owner.changed')
  async onWorkspaceOwnerChanged({
    workspaceId,
    from,
    to,
  }: Events['workspace.owner.changed']) {
    await this.reconcileWorkspaceQuotaState(workspaceId);
    await Promise.all([
      this.reconcileUserQuotaState(from),
      this.reconcileUserQuotaState(to),
    ]);
  }

  @OnEvent('workspace.blobs.updated')
  async onWorkspaceBlobsUpdated({
    workspaceId,
  }: Events['workspace.blobs.updated']) {
    const owner = await this.getWorkspaceOwner(workspaceId);
    await Promise.all([
      this.reconcileWorkspaceQuotaState(workspaceId),
      this.reconcileUserQuotaState(owner.id),
    ]);
  }

  private async reconcileOwnedWorkspaces(userId: string) {
    const workspaces = await this.getOwnedWorkspaceIds(userId);

    await this.reconcileMany(
      workspaces.map(
        workspaceId => () => this.reconcileWorkspaceQuotaState(workspaceId)
      )
    );
  }

  private async getOwnerStorageUsage(userId: string) {
    const workspaces = await this.getOwnedWorkspaceIds(userId);
    const usages = await this.mapMany(workspaces, async workspaceId => {
      const entitlement =
        await this.entitlement.resolveWorkspaceEntitlement(workspaceId);

      return this.hasStandaloneWorkspaceQuota(entitlement.plan)
        ? 0n
        : this.getWorkspaceStorageUsage(workspaceId);
    });

    return usages.reduce((total, usage) => total + usage, 0n);
  }

  private async getWorkspaceOwner(workspaceId: string) {
    const owner = await this.db.workspaceMember.findFirst({
      where: {
        workspaceId,
        role: 'owner',
        state: 'active',
      },
      select: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!owner) {
      throw new Error('Workspace owner not found');
    }
    return owner.user;
  }

  private async getChargedMemberCount(workspaceId: string) {
    const [members, invitations] = await Promise.all([
      this.db.workspaceMember.count({
        where: { workspaceId, state: 'active' },
      }),
      this.db.workspaceInvitation.count({
        where: {
          workspaceId,
          status: {
            not: 'waiting_review',
          },
        },
      }),
    ]);
    return members + invitations;
  }

  private async getOwnedWorkspaceIds(userId: string) {
    const workspaces = await this.db.workspaceMember.findMany({
      where: {
        userId,
        role: 'owner',
        state: 'active',
      },
      select: {
        workspaceId: true,
      },
    });
    return workspaces.map(workspace => workspace.workspaceId);
  }

  private async getWorkspaceStorageUsage(workspaceId: string) {
    const sum = await this.db.blob.aggregate({
      where: {
        workspaceId,
        deletedAt: null,
      },
      _sum: {
        size: true,
      },
    });

    return BigInt(sum._sum.size ?? 0);
  }

  private hasStandaloneWorkspaceQuota(plan: string) {
    return plan === 'team' || plan === 'selfhost_team';
  }

  private quotaData(quota: Quota) {
    return {
      blobLimit: BigInt(quota.blobLimit),
      storageQuota: BigInt(quota.storageQuota),
      historyPeriodSeconds: quota.historyPeriod,
      copilotActionLimit: quota.copilotActionLimit ?? null,
    };
  }

  private workspaceQuotaData(quota: Quota) {
    return {
      blobLimit: BigInt(quota.blobLimit),
      storageQuota: BigInt(quota.storageQuota),
      historyPeriodSeconds: quota.historyPeriod,
    };
  }

  private async reconcileMany(tasks: Array<() => Promise<unknown>>) {
    await this.mapMany(tasks, task => task());
  }

  private async mapMany<T, U>(items: T[], mapper: (item: T) => Promise<U>) {
    const batchSize = 16;
    const results: U[] = [];
    for (let index = 0; index < items.length; index += batchSize) {
      results.push(
        ...(await Promise.all(
          items.slice(index, index + batchSize).map(item => mapper(item))
        ))
      );
    }
    return results;
  }

  private userQuotaStateChanged(
    previous: Awaited<
      ReturnType<PrismaClient['effectiveUserQuotaState']['findUnique']>
    >,
    current: Awaited<
      ReturnType<PrismaClient['effectiveUserQuotaState']['upsert']>
    >
  ) {
    if (!previous) {
      return true;
    }
    return (
      previous.plan !== current.plan ||
      previous.sourceEntitlementId !== current.sourceEntitlementId ||
      previous.blobLimit !== current.blobLimit ||
      previous.storageQuota !== current.storageQuota ||
      previous.usedStorageQuota !== current.usedStorageQuota ||
      previous.historyPeriodSeconds !== current.historyPeriodSeconds ||
      previous.copilotActionLimit !== current.copilotActionLimit ||
      previous.known !== current.known ||
      previous.stale !== current.stale ||
      JSON.stringify(previous.flags) !== JSON.stringify(current.flags)
    );
  }

  private workspaceQuotaStateChanged(
    previous: Awaited<
      ReturnType<PrismaClient['effectiveWorkspaceQuotaState']['findUnique']>
    >,
    current: Awaited<
      ReturnType<PrismaClient['effectiveWorkspaceQuotaState']['upsert']>
    >
  ) {
    if (!previous) {
      return true;
    }
    return (
      previous.plan !== current.plan ||
      previous.sourceEntitlementId !== current.sourceEntitlementId ||
      previous.ownerUserId !== current.ownerUserId ||
      previous.usesOwnerQuota !== current.usesOwnerQuota ||
      previous.seatLimit !== current.seatLimit ||
      previous.memberCount !== current.memberCount ||
      previous.overcapacityMemberCount !== current.overcapacityMemberCount ||
      previous.blobLimit !== current.blobLimit ||
      previous.storageQuota !== current.storageQuota ||
      previous.usedStorageQuota !== current.usedStorageQuota ||
      previous.historyPeriodSeconds !== current.historyPeriodSeconds ||
      previous.readonly !== current.readonly ||
      previous.known !== current.known ||
      previous.stale !== current.stale ||
      previous.readonlyReasons.join(',') !==
        current.readonlyReasons.join(',') ||
      JSON.stringify(previous.flags) !== JSON.stringify(current.flags)
    );
  }

  private staleAfter(now: Date) {
    return new Date(now.getTime() + STATE_TTL);
  }
}
