import { randomUUID } from 'node:crypto';

import {
  Args,
  Field,
  Int,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

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
  type NativeSubscription,
  normalizeSubscription,
  type Subscription,
} from './model';
import { InvoiceType, SubscriptionType } from './resolver';
import { SubscriptionPlan, SubscriptionRecurring } from './types';

@ObjectType()
class SubscriptionBillingSource {
  @Field()
  id!: string;

  @Field()
  provider!: string;

  @Field(() => String, { nullable: true })
  iapStore!: string | null;

  @Field(() => SubscriptionRecurring, { nullable: true })
  recurring!: SubscriptionRecurring | null;
}

@ObjectType()
class SubscriptionBillingGroup {
  @Field(() => SubscriptionPlan)
  plan!: SubscriptionPlan;

  @Field(() => [SubscriptionBillingSource])
  sources!: SubscriptionBillingSource[];
}

@ObjectType()
class SubscriptionBillingInfo {
  @Field(() => [SubscriptionType])
  subscriptions!: Subscription[];

  @Field(() => [SubscriptionBillingGroup])
  conflicts!: SubscriptionBillingGroup[];

  @Field(() => [SubscriptionBillingGroup])
  manageable!: SubscriptionBillingGroup[];
}

interface SubscriptionRead extends Pick<
  SubscriptionBillingInfo,
  'conflicts' | 'manageable'
> {
  subscriptions: NativeSubscription[];
}

@Resolver(() => UserType)
export class UserSubscriptionResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  private currentUserSubscriptions(userId: string) {
    return this.runtime.listPaymentSubscriptionsV1<SubscriptionRead>(
      'user',
      userId
    );
  }

  @ResolveField(() => [SubscriptionType])
  async subscriptions(
    @CurrentUser() me: CurrentUser,
    @Parent() user: Pick<User, 'id'>
  ): Promise<Subscription[]> {
    if (me.id !== user.id) {
      throw new AccessDenied();
    }
    const { subscriptions } = await this.currentUserSubscriptions(user.id);
    return subscriptions.map(normalizeSubscription);
  }

  @ResolveField(() => SubscriptionBillingInfo)
  async subscriptionBilling(
    @CurrentUser() me: CurrentUser,
    @Parent() user: Pick<User, 'id'>
  ): Promise<SubscriptionBillingInfo> {
    if (me.id !== user.id) {
      throw new AccessDenied();
    }
    const { subscriptions, conflicts, manageable } =
      await this.currentUserSubscriptions(user.id);
    return {
      subscriptions: subscriptions.map(normalizeSubscription),
      conflicts,
      manageable,
    };
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
      const { subscriptions } =
        await this.runtime.executePaymentCommandV1<SubscriptionRead>({
          action: 'request_apply_revenuecat',
          userId: user.id,
          transactionId,
          intentId: randomUUID(),
        });
      return subscriptions.map(normalizeSubscription);
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
    const { subscriptions } =
      await this.runtime.executePaymentCommandV1<SubscriptionRead>({
        action: 'refresh_subscriptions',
        userId: user.id,
      });
    return subscriptions.map(normalizeSubscription);
  }
}

@Resolver(() => WorkspaceType)
export class WorkspaceSubscriptionResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly ac: PermissionAccess,
    private readonly runtime: BackendRuntimeProvider
  ) {}

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
    const { subscriptions } =
      await this.runtime.listPaymentSubscriptionsV1<SubscriptionRead>(
        'workspace',
        workspace.id
      );
    return subscriptions.length
      ? normalizeSubscription(subscriptions[0])
      : null;
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
