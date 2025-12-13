import { Headers } from '@nestjs/common';
import {
  Args,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { PrismaClient, Provider, type User } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-scalars';
import { groupBy } from 'lodash-es';
import Stripe from 'stripe';
import { z } from 'zod';

import {
  AccessDenied,
  AuthenticationRequired,
  FailedToCheckout,
  InvalidSubscriptionParameters,
  Throttle,
  WorkspaceIdRequiredToUpdateTeamSubscription,
} from '../../base';
import { CurrentUser, Public } from '../../core/auth';
import { AccessController } from '../../core/permission';
import { UserType } from '../../core/user';
import { WorkspaceType } from '../../core/workspaces';
import { Invoice, Subscription, WorkspaceSubscriptionManager } from './manager';
import { RevenueCatWebhookHandler } from './revenuecat';
import { CheckoutParams, SubscriptionService } from './service';
import {
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from './types';

registerEnumType(SubscriptionStatus, { name: 'SubscriptionStatus' });
registerEnumType(SubscriptionRecurring, { name: 'SubscriptionRecurring' });
registerEnumType(SubscriptionVariant, { name: 'SubscriptionVariant' });
registerEnumType(SubscriptionPlan, { name: 'SubscriptionPlan' });
registerEnumType(InvoiceStatus, { name: 'InvoiceStatus' });

@ObjectType()
class SubscriptionPrice {
  @Field(() => String)
  type!: 'fixed';

  @Field(() => SubscriptionPlan)
  plan!: SubscriptionPlan;

  @Field()
  currency!: string;

  @Field(() => Int, { nullable: true })
  amount?: number | null;

  @Field(() => Int, { nullable: true })
  yearlyAmount?: number | null;

  @Field(() => Int, { nullable: true })
  lifetimeAmount?: number | null;
}

@ObjectType()
export class SubscriptionType implements Partial<Subscription> {
  @Field(() => SubscriptionPlan, {
    description:
      "The 'Free' plan just exists to be a placeholder and for the type convenience of frontend.\nThere won't actually be a subscription with plan 'Free'",
  })
  plan!: SubscriptionPlan;

  @Field(() => SubscriptionRecurring)
  recurring!: SubscriptionRecurring;

  @Field(() => SubscriptionVariant, { nullable: true })
  variant!: SubscriptionVariant | null;

  @Field(() => SubscriptionStatus)
  status!: SubscriptionStatus;

  @Field(() => Date)
  start!: Date;

  @Field(() => Date, { nullable: true })
  end!: Date | null;

  @Field(() => Date, { nullable: true })
  trialStart!: Date | null;

  @Field(() => Date, { nullable: true })
  trialEnd!: Date | null;

  @Field(() => Date, { nullable: true })
  nextBillAt!: Date | null;

  @Field(() => Date, { nullable: true })
  canceledAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  // read-only fields for display purpose
  // provider: 'stripe' | 'revenuecat'
  @Field(() => String, {
    nullable: true,
    description:
      'Payment provider of this subscription. Read-only. One of: stripe | revenuecat',
  })
  provider?: string | null;

  // iapStore: 'app_store' | 'play_store' | null when provider is stripe
  @Field(() => String, {
    nullable: true,
    description:
      'If provider is revenuecat, indicates underlying store. Read-only. One of: app_store | play_store',
  })
  iapStore?: string | null;

  // deprecated fields
  @Field(() => String, {
    name: 'id',
    nullable: true,
    deprecationReason: 'removed',
  })
  stripeSubscriptionId!: string;
}

@ObjectType()
export class InvoiceType implements Partial<Invoice> {
  @Field()
  currency!: string;

  @Field()
  amount!: number;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field()
  reason!: string;

  @Field(() => String, { nullable: true })
  lastPaymentError!: string | null;

  @Field(() => String, { nullable: true })
  link!: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  // deprecated fields
  @Field(() => String, {
    name: 'id',
    nullable: true,
    deprecationReason: 'removed',
  })
  stripeInvoiceId?: string;

  @Field(() => SubscriptionPlan, {
    nullable: true,
    deprecationReason: 'removed',
  })
  plan!: SubscriptionPlan | null;

  @Field(() => SubscriptionRecurring, {
    nullable: true,
    deprecationReason: 'removed',
  })
  recurring!: SubscriptionRecurring | null;
}

@InputType()
class CreateCheckoutSessionInput implements z.infer<typeof CheckoutParams> {
  @Field(() => SubscriptionRecurring, {
    nullable: true,
    defaultValue: SubscriptionRecurring.Yearly,
  })
  recurring!: SubscriptionRecurring;

  @Field(() => SubscriptionPlan, {
    nullable: true,
    defaultValue: SubscriptionPlan.Pro,
  })
  plan!: SubscriptionPlan;

  @Field(() => SubscriptionVariant, {
    nullable: true,
  })
  variant!: SubscriptionVariant | null;

  @Field(() => String, { nullable: true })
  coupon!: string | null;

  @Field(() => String)
  successCallbackLink!: string;

  @Field(() => String, {
    nullable: true,
    deprecationReason: 'not required anymore',
  })
  idempotencyKey?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  args!: { workspaceId?: string; quantity?: number } | null;
}

@Resolver(() => SubscriptionType)
export class SubscriptionResolver {
  constructor(private readonly service: SubscriptionService) {}

  @Public()
  @Query(() => [SubscriptionPrice])
  async prices(
    @CurrentUser() user?: CurrentUser
  ): Promise<SubscriptionPrice[]> {
    const prices = await this.service.listPrices(user);

    const group = groupBy(prices, price => {
      return price.lookupKey.plan;
    });

    function findPrice(plan: SubscriptionPlan) {
      const prices = group[plan];

      if (!prices) {
        return null;
      }

      const monthlyPrice = prices.find(
        p => p.lookupKey.recurring === SubscriptionRecurring.Monthly
      );
      const yearlyPrice = prices.find(
        p => p.lookupKey.recurring === SubscriptionRecurring.Yearly
      );
      const lifetimePrice = prices.find(
        p => p.lookupKey.recurring === SubscriptionRecurring.Lifetime
      );

      const currency =
        monthlyPrice?.price.currency ?? yearlyPrice?.price.currency ?? 'usd';

      return {
        currency,
        amount: monthlyPrice?.price.unit_amount,
        yearlyAmount: yearlyPrice?.price.unit_amount,
        lifetimeAmount: lifetimePrice?.price.unit_amount,
      };
    }

    // extend it when new plans are added
    const fixedPlans = [
      SubscriptionPlan.Pro,
      SubscriptionPlan.AI,
      SubscriptionPlan.Team,
    ];

    return fixedPlans.reduce((prices, plan) => {
      const price = findPrice(plan);

      if (price && (price.amount || price.yearlyAmount)) {
        prices.push({
          type: 'fixed',
          plan,
          ...price,
        });
      }

      return prices;
    }, [] as SubscriptionPrice[]);
  }

  @Public()
  @Mutation(() => String, {
    description: 'Create a subscription checkout link of stripe',
  })
  async createCheckoutSession(
    @CurrentUser() user: CurrentUser | null,
    @Args({ name: 'input', type: () => CreateCheckoutSessionInput })
    input: CreateCheckoutSessionInput
  ) {
    let session: Stripe.Checkout.Session;

    if (input.plan === SubscriptionPlan.SelfHostedTeam) {
      session = await this.service.checkout(input, {
        plan: input.plan as any,
        quantity: input.args?.quantity ?? 10,
        user,
      });
    } else {
      if (!user) {
        throw new AuthenticationRequired();
      }

      session = await this.service.checkout(input, {
        plan: input.plan as any,
        user,
        workspaceId: input.args?.workspaceId,
      });
    }

    if (!session.url) {
      throw new FailedToCheckout();
    }

    return session.url;
  }

  @Mutation(() => String, {
    description: 'Create a stripe customer portal to manage payment methods',
  })
  async createCustomerPortal(@CurrentUser() user: CurrentUser) {
    return this.service.createCustomerPortal(user.id);
  }

  @Mutation(() => SubscriptionType)
  async cancelSubscription(
    @CurrentUser() user: CurrentUser,
    @Args({
      name: 'plan',
      type: () => SubscriptionPlan,
      nullable: true,
      defaultValue: SubscriptionPlan.Pro,
    })
    plan: SubscriptionPlan,
    @Args({ name: 'workspaceId', type: () => String, nullable: true })
    workspaceId: string | null,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Args('idempotencyKey', {
      type: () => String,
      nullable: true,
      deprecationReason: 'use header `Idempotency-Key`',
    })
    _?: string
  ) {
    if (plan === SubscriptionPlan.Team) {
      if (!workspaceId) {
        throw new WorkspaceIdRequiredToUpdateTeamSubscription();
      }

      return this.service.cancelSubscription(
        { workspaceId, plan },
        idempotencyKey
      );
    }

    return this.service.cancelSubscription(
      {
        userId: user.id,
        // @ts-expect-error exam inside
        plan,
      },
      idempotencyKey
    );
  }

  @Mutation(() => SubscriptionType)
  async resumeSubscription(
    @CurrentUser() user: CurrentUser,
    @Args({
      name: 'plan',
      type: () => SubscriptionPlan,
      nullable: true,
      defaultValue: SubscriptionPlan.Pro,
    })
    plan: SubscriptionPlan,
    @Args({ name: 'workspaceId', type: () => String, nullable: true })
    workspaceId: string | null,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Args('idempotencyKey', {
      type: () => String,
      nullable: true,
      deprecationReason: 'use header `Idempotency-Key`',
    })
    _?: string
  ) {
    if (plan === SubscriptionPlan.Team) {
      if (!workspaceId) {
        throw new WorkspaceIdRequiredToUpdateTeamSubscription();
      }

      return this.service.resumeSubscription(
        { workspaceId, plan },
        idempotencyKey
      );
    }

    return this.service.resumeSubscription(
      {
        userId: user.id,
        // @ts-expect-error exam inside
        plan,
      },
      idempotencyKey
    );
  }

  @Mutation(() => SubscriptionType)
  async updateSubscriptionRecurring(
    @CurrentUser() user: CurrentUser,
    @Args({
      name: 'plan',
      type: () => SubscriptionPlan,
      nullable: true,
      defaultValue: SubscriptionPlan.Pro,
    })
    plan: SubscriptionPlan,
    @Args({ name: 'workspaceId', type: () => String, nullable: true })
    workspaceId: string | null,
    @Args({ name: 'recurring', type: () => SubscriptionRecurring })
    recurring: SubscriptionRecurring,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Args('idempotencyKey', {
      type: () => String,
      nullable: true,
      deprecationReason: 'use header `Idempotency-Key`',
    })
    _?: string
  ) {
    if (plan === SubscriptionPlan.Team) {
      if (!workspaceId) {
        throw new WorkspaceIdRequiredToUpdateTeamSubscription();
      }

      return this.service.updateSubscriptionRecurring(
        { workspaceId, plan },
        recurring,
        idempotencyKey
      );
    }

    return this.service.updateSubscriptionRecurring(
      {
        userId: user.id,
        // @ts-expect-error exam inside
        plan,
      },
      recurring,
      idempotencyKey
    );
  }

  @Public()
  @Throttle('strict')
  @Mutation(() => String)
  async generateLicenseKey(
    @Args('sessionId', { type: () => String }) sessionId: string
  ) {
    return this.service.generateLicenseKey(sessionId);
  }
}

@Resolver(() => UserType)
export class UserSubscriptionResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly rcHandler: RevenueCatWebhookHandler
  ) {}

  private normalizeSubscription(s: Subscription) {
    if (
      s.variant &&
      ![SubscriptionVariant.EA, SubscriptionVariant.Onetime].includes(
        s.variant as SubscriptionVariant
      )
    ) {
      s.variant = null;
    }
    return s;
  }

  @ResolveField(() => [SubscriptionType])
  async subscriptions(
    @CurrentUser() me: User,
    @Parent() user: User
  ): Promise<Subscription[]> {
    if (me.id !== user.id) {
      throw new AccessDenied();
    }

    const subscriptions = await this.db.subscription.findMany({
      where: {
        targetId: user.id,
        status: {
          in: [
            SubscriptionStatus.Active,
            SubscriptionStatus.Trialing,
            SubscriptionStatus.PastDue,
          ],
        },
      },
    });

    subscriptions.forEach(subscription =>
      this.normalizeSubscription(subscription)
    );

    return subscriptions;
  }

  @ResolveField(() => Int, {
    name: 'invoiceCount',
    description: 'Get user invoice count',
  })
  async invoiceCount(@CurrentUser() user: CurrentUser) {
    return this.db.invoice.count({
      where: { targetId: user.id },
    });
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
      where: {
        targetId: user.id,
      },
      take,
      skip,
      orderBy: {
        createdAt: 'desc',
      },
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

    let existsSubscription = await this.db.subscription.findFirst({
      where: { rcExternalRef: transactionId },
    });

    // subscription with the transactionId already exists
    if (existsSubscription) {
      if (existsSubscription.targetId !== user.id) {
        throw new InvalidSubscriptionParameters();
      } else {
        this.normalizeSubscription(existsSubscription);
        return [existsSubscription];
      }
    }

    let current: Subscription[] = [];

    try {
      await this.rcHandler.syncAppUserWithExternalRef(user.id, transactionId);
      current = await this.db.subscription.findMany({
        where: {
          targetId: user.id,
          status: {
            in: [
              SubscriptionStatus.Active,
              SubscriptionStatus.Trialing,
              SubscriptionStatus.PastDue,
            ],
          },
        },
      });
      // ignore errors
    } catch {}

    current.forEach(subscription => this.normalizeSubscription(subscription));

    return current;
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

    let current = await this.db.subscription.findMany({
      where: {
        targetId: user.id,
        status: {
          in: [
            SubscriptionStatus.Active,
            SubscriptionStatus.Trialing,
            SubscriptionStatus.PastDue,
          ],
        },
      },
    });

    const existsPlans = Object.values(SubscriptionPlan);
    const subscriptions = current.reduce(
      (r, s) => {
        if (existsPlans.includes(s.plan as SubscriptionPlan)) {
          r[s.plan as SubscriptionPlan] = s.provider;
        }
        return r;
      },
      {} as Record<SubscriptionPlan, Provider>
    );

    // has revenuecat subscription or no subscription at all
    const shouldSync =
      current.length === 0 ||
      subscriptions.pro === Provider.revenuecat ||
      subscriptions.ai === Provider.revenuecat;

    if (shouldSync) {
      try {
        await this.rcHandler.syncAppUser(user.id);
        current = await this.db.subscription.findMany({
          where: {
            targetId: user.id,
            status: {
              in: [
                SubscriptionStatus.Active,
                SubscriptionStatus.Trialing,
                SubscriptionStatus.PastDue,
              ],
            },
          },
        });
        // ignore errors
      } catch {}
    }

    current.forEach(subscription => this.normalizeSubscription(subscription));

    return current;
  }
}

@Resolver(() => WorkspaceType)
export class WorkspaceSubscriptionResolver {
  constructor(
    private readonly service: WorkspaceSubscriptionManager,
    private readonly db: PrismaClient,
    private readonly ac: AccessController
  ) {}

  @ResolveField(() => SubscriptionType, {
    nullable: true,
    description: 'The team subscription of the workspace, if exists.',
  })
  async subscription(@Parent() workspace: WorkspaceType) {
    return this.service.getActiveSubscription({
      plan: SubscriptionPlan.Team,
      workspaceId: workspace.id,
    });
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

    return this.db.invoice.count({
      where: {
        targetId: workspace.id,
      },
    });
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
      where: {
        targetId: workspace.id,
      },
      take,
      skip,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
