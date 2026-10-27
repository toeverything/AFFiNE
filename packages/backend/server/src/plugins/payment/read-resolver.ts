import { randomUUID } from 'node:crypto';

import {
  Args,
  Int,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { PrismaClient, Provider } from '@prisma/client';

import {
  AccessDenied,
  AuthenticationRequired,
  InvalidSubscriptionParameters,
  Throttle,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { PermissionAccess } from '../../core/permission';
import { UserType } from '../../core/user';
import { WorkspaceType } from '../../core/workspaces';
import {
  type Subscription,
  subscriptionFromEntitlement,
  subscriptionPlanFromEntitlement,
  visibleEntitlementWhere,
  visibleSubscriptionWhere,
} from './model';
import { InvoiceType, SubscriptionType } from './resolver';
import { SubscriptionPlan } from './types';

@Resolver(() => UserType)
export class UserSubscriptionResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  private async currentUserSubscriptions(userId: string) {
    const entitlements = (
      await this.db.entitlement.findMany({
        where: visibleEntitlementWhere('user', userId),
        orderBy: { updatedAt: 'desc' },
      })
    ).filter(
      entitlement =>
        entitlement.source === 'cloud_subscription' &&
        ['pro', 'lifetime_pro', 'ai'].includes(entitlement.plan)
    );
    const providerFacts = await this.db.providerSubscription.findMany({
      where: {
        targetType: 'user',
        targetId: userId,
        plan: {
          in: entitlements.map(entitlement =>
            subscriptionPlanFromEntitlement(entitlement.plan)
          ),
        },
        ...visibleSubscriptionWhere(),
      },
      orderBy: { updatedAt: 'desc' },
    });

    return entitlements.map(entitlement => {
      const plan = subscriptionPlanFromEntitlement(entitlement.plan);
      return subscriptionFromEntitlement(
        entitlement,
        providerFacts.find(fact => fact.plan === plan),
        plan
      );
    });
  }

  @ResolveField(() => [SubscriptionType])
  async subscriptions(
    @CurrentUser() me: User,
    @Parent() user: User
  ): Promise<Subscription[]> {
    if (me.id !== user.id) {
      throw new AccessDenied();
    }
    return this.currentUserSubscriptions(user.id);
  }

  @ResolveField(() => Int, {
    name: 'invoiceCount',
    description: 'Get user invoice count',
  })
  async invoiceCount(@CurrentUser() me: User, @Parent() user: User) {
    if (me.id !== user.id) {
      throw new AccessDenied();
    }
    return this.db.invoice.count({ where: { targetId: user.id } });
  }

  @ResolveField(() => [InvoiceType])
  async invoices(
    @CurrentUser() me: User,
    @Parent() user: User,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 8 })
    take: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number
  ) {
    if (me.id !== user.id) {
      throw new AccessDenied();
    }
    return this.db.invoice.findMany({
      where: { targetId: user.id },
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Throttle('strict')
  @Mutation(() => [SubscriptionType], {
    description: 'Request to apply the subscription in advance',
  })
  async requestApplySubscription(
    @CurrentUser() user: CurrentUser,
    @Args('transactionId') transactionId: string
  ): Promise<Subscription[]> {
    if (!user) {
      throw new AuthenticationRequired();
    }
    try {
      await this.runtime.executePaymentCommandV1({
        action: 'request_apply_revenuecat',
        userId: user.id,
        transactionId,
        intentId: randomUUID(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('belongs to another user') ||
        message.includes('ambiguous ownership') ||
        message.includes('not canonical')
      ) {
        throw new InvalidSubscriptionParameters();
      }
      throw error;
    }
    return this.currentUserSubscriptions(user.id);
  }

  @Throttle('strict')
  @Mutation(() => [SubscriptionType], {
    description: 'Refresh current user subscriptions and return latest.',
  })
  async refreshUserSubscriptions(
    @CurrentUser() user: CurrentUser
  ): Promise<Subscription[]> {
    if (!user) {
      throw new AuthenticationRequired();
    }
    const current = await this.db.providerSubscription.findMany({
      where: {
        targetType: 'user',
        targetId: user.id,
        ...visibleSubscriptionWhere(),
      },
    });
    const plans = Object.values(SubscriptionPlan);
    const subscriptions = current.reduce(
      (result, subscription) => {
        if (plans.includes(subscription.plan as SubscriptionPlan)) {
          result[subscription.plan as SubscriptionPlan] = subscription.provider;
        }
        return result;
      },
      {} as Record<SubscriptionPlan, Provider>
    );
    if (
      current.length === 0 ||
      subscriptions.pro === Provider.revenuecat ||
      subscriptions.ai === Provider.revenuecat
    ) {
      try {
        await this.runtime.executePaymentCommandV1({
          action: 'refresh_revenuecat',
          userId: user.id,
        });
      } catch {}
    }
    return this.currentUserSubscriptions(user.id);
  }
}

@Resolver(() => WorkspaceType)
export class WorkspaceSubscriptionResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly ac: PermissionAccess
  ) {}

  private async currentWorkspaceSubscription(workspaceId: string) {
    const entitlement = await this.db.entitlement.findFirst({
      where: visibleEntitlementWhere('workspace', workspaceId),
      orderBy: { updatedAt: 'desc' },
    });
    if (
      !entitlement ||
      entitlement.source !== 'cloud_subscription' ||
      entitlement.plan !== 'team'
    ) {
      return null;
    }
    const providerFact = await this.db.providerSubscription.findFirst({
      where: {
        targetType: 'workspace',
        targetId: workspaceId,
        plan: SubscriptionPlan.Team,
        ...visibleSubscriptionWhere(),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return subscriptionFromEntitlement(
      entitlement,
      providerFact ?? undefined,
      SubscriptionPlan.Team
    );
  }

  @ResolveField(() => SubscriptionType, {
    nullable: true,
    description: 'The team subscription of the workspace, if exists.',
  })
  async subscription(
    @CurrentUser() me: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    await this.ac
      .user(me.id)
      .workspace(workspace.id)
      .assert('Workspace.Payment.Manage');
    return this.currentWorkspaceSubscription(workspace.id);
  }

  @ResolveField(() => Int, {
    name: 'invoiceCount',
    description: 'Get user invoice count',
  })
  async invoiceCount(
    @CurrentUser() me: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    await this.ac
      .user(me.id)
      .workspace(workspace.id)
      .assert('Workspace.Payment.Manage');
    return this.db.invoice.count({ where: { targetId: workspace.id } });
  }

  @ResolveField(() => [InvoiceType])
  async invoices(
    @CurrentUser() me: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 8 })
    take: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number
  ) {
    await this.ac
      .user(me.id)
      .workspace(workspace.id)
      .assert('Workspace.Payment.Manage');
    return this.db.invoice.findMany({
      where: { targetId: workspace.id },
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    });
  }
}
