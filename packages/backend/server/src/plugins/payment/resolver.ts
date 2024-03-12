import {
  BadGatewayException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  Args,
  Context,
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
import type { User, UserInvoice, UserSubscription } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { groupBy } from 'lodash-es';

import { CurrentUser, Public } from '../../core/auth';
import { UserType } from '../../core/user';
import { Config } from '../../fundamentals';
import { decodeLookupKey, SubscriptionService } from './service';
import {
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from './types';

registerEnumType(SubscriptionStatus, { name: 'SubscriptionStatus' });
registerEnumType(SubscriptionRecurring, { name: 'SubscriptionRecurring' });
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

  @Field()
  amount!: number;

  @Field()
  yearlyAmount!: number;
}

@ObjectType('UserSubscription')
export class UserSubscriptionType implements Partial<UserSubscription> {
  @Field({ name: 'id' })
  stripeSubscriptionId!: string;

  @Field(() => SubscriptionPlan)
  plan!: SubscriptionPlan;

  @Field(() => SubscriptionRecurring)
  recurring!: SubscriptionRecurring;

  @Field(() => SubscriptionStatus)
  status!: SubscriptionStatus;

  @Field(() => Date)
  start!: Date;

  @Field(() => Date)
  end!: Date;

  @Field(() => Date, { nullable: true })
  trialStart?: Date | null;

  @Field(() => Date, { nullable: true })
  trialEnd?: Date | null;

  @Field(() => Date, { nullable: true })
  nextBillAt?: Date | null;

  @Field(() => Date, { nullable: true })
  canceledAt?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType('UserInvoice')
class UserInvoiceType implements Partial<UserInvoice> {
  @Field({ name: 'id' })
  stripeInvoiceId!: string;

  @Field(() => SubscriptionPlan)
  plan!: SubscriptionPlan;

  @Field(() => SubscriptionRecurring)
  recurring!: SubscriptionRecurring;

  @Field()
  currency!: string;

  @Field()
  amount!: number;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field()
  reason!: string;

  @Field(() => String, { nullable: true })
  lastPaymentError?: string | null;

  @Field(() => String, { nullable: true })
  link?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@InputType()
class CreateCheckoutSessionInput {
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

  @Field(() => String, { nullable: true })
  coupon!: string | null;

  @Field(() => String, { nullable: true })
  successCallbackLink!: string | null;

  // @FIXME(forehalo): we should put this field in the header instead of as a explicity args
  @Field(() => String)
  idempotencyKey!: string;
}

@Resolver(() => UserSubscriptionType)
export class SubscriptionResolver {
  constructor(
    private readonly service: SubscriptionService,
    private readonly config: Config
  ) {}

  @Public()
  @Query(() => [SubscriptionPrice])
  async prices(): Promise<SubscriptionPrice[]> {
    const prices = await this.service.listPrices();

    const group = groupBy(
      prices.data.filter(price => !!price.lookup_key),
      price => {
        // @ts-expect-error empty lookup key is filtered out
        const [plan] = decodeLookupKey(price.lookup_key);
        return plan;
      }
    );

    return Object.entries(group).map(([plan, prices]) => {
      const yearly = prices.find(
        price =>
          decodeLookupKey(
            // @ts-expect-error empty lookup key is filtered out
            price.lookup_key
          )[1] === SubscriptionRecurring.Yearly
      );
      const monthly = prices.find(
        price =>
          decodeLookupKey(
            // @ts-expect-error empty lookup key is filtered out
            price.lookup_key
          )[1] === SubscriptionRecurring.Monthly
      );

      if (!yearly || !monthly) {
        throw new InternalServerErrorException(
          'The prices are not configured correctly.'
        );
      }

      return {
        type: 'fixed',
        plan: plan as SubscriptionPlan,
        currency: monthly.currency,
        amount: monthly.unit_amount ?? 0,
        yearlyAmount: yearly.unit_amount ?? 0,
      };
    });
  }

  /**
   * @deprecated
   */
  @Mutation(() => String, {
    deprecationReason: 'use `createCheckoutSession` instead',
    description: 'Create a subscription checkout link of stripe',
  })
  async checkout(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'recurring', type: () => SubscriptionRecurring })
    recurring: SubscriptionRecurring,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    const session = await this.service.createCheckoutSession({
      user,
      plan: SubscriptionPlan.Pro,
      recurring,
      redirectUrl: `${this.config.baseUrl}/upgrade-success`,
      idempotencyKey,
    });

    if (!session.url) {
      throw new BadGatewayException('Failed to create checkout session.');
    }

    return session.url;
  }

  @Mutation(() => String, {
    description: 'Create a subscription checkout link of stripe',
  })
  async createCheckoutSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'input', type: () => CreateCheckoutSessionInput })
    input: CreateCheckoutSessionInput
  ) {
    const session = await this.service.createCheckoutSession({
      user,
      plan: input.plan,
      recurring: input.recurring,
      promotionCode: input.coupon,
      redirectUrl:
        input.successCallbackLink ?? `${this.config.baseUrl}/upgrade-success`,
      idempotencyKey: input.idempotencyKey,
    });

    if (!session.url) {
      throw new BadGatewayException('Failed to create checkout session.');
    }

    return session.url;
  }

  @Mutation(() => String, {
    description: 'Create a stripe customer portal to manage payment methods',
  })
  async createCustomerPortal(@CurrentUser() user: CurrentUser) {
    return this.service.createCustomerPortal(user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async cancelSubscription(
    @CurrentUser() user: CurrentUser,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    return this.service.cancelSubscription(idempotencyKey, user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async resumeSubscription(
    @CurrentUser() user: CurrentUser,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    return this.service.resumeCanceledSubscription(idempotencyKey, user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async updateSubscriptionRecurring(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'recurring', type: () => SubscriptionRecurring })
    recurring: SubscriptionRecurring,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    return this.service.updateSubscriptionRecurring(
      idempotencyKey,
      user.id,
      recurring
    );
  }
}

@Resolver(() => UserType)
export class UserSubscriptionResolver {
  constructor(
    private readonly config: Config,
    private readonly db: PrismaClient
  ) {}

  @ResolveField(() => UserSubscriptionType, { nullable: true })
  async subscription(
    @Context() ctx: { isAdminQuery: boolean },
    @CurrentUser() me: User,
    @Parent() user: User
  ) {
    // allow admin to query other user's subscription
    if (!ctx.isAdminQuery && me.id !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to access this subscription.'
      );
    }

    // @FIXME(@forehalo): should not mock any api for selfhosted server
    // the frontend should avoid calling such api if feature is not enabled
    if (this.config.isSelfhosted) {
      const start = new Date();
      const end = new Date();
      end.setFullYear(start.getFullYear() + 1);

      return {
        stripeSubscriptionId: 'dummy',
        plan: SubscriptionPlan.SelfHosted,
        recurring: SubscriptionRecurring.Yearly,
        status: SubscriptionStatus.Active,
        start,
        end,
        createdAt: start,
        updatedAt: start,
      };
    }

    return this.db.userSubscription.findUnique({
      where: {
        userId: user.id,
        status: SubscriptionStatus.Active,
      },
    });
  }

  @ResolveField(() => [UserInvoiceType])
  async invoices(
    @CurrentUser() me: User,
    @Parent() user: User,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 8 })
    take: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number
  ) {
    if (me.id !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to access this invoices'
      );
    }

    return this.db.userInvoice.findMany({
      where: {
        userId: user.id,
      },
      take,
      skip,
      orderBy: {
        id: 'desc',
      },
    });
  }
}
