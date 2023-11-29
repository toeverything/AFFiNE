import { HttpStatus } from '@nestjs/common';
import {
  Args,
  Field,
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
import { GraphQLError } from 'graphql';
import { groupBy } from 'lodash-es';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { Auth, CurrentUser, Public } from '../auth';
import { UserType } from '../users';
import {
  decodeLookupKey,
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionService,
  SubscriptionStatus,
} from './service';

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
class UserSubscriptionType implements Partial<UserSubscription> {
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

@Auth()
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
        throw new GraphQLError('The prices are not configured correctly', {
          extensions: {
            status: HttpStatus[HttpStatus.BAD_GATEWAY],
            code: HttpStatus.BAD_GATEWAY,
          },
        });
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

  @Mutation(() => String, {
    description: 'Create a subscription checkout link of stripe',
  })
  async checkout(
    @CurrentUser() user: User,
    @Args({ name: 'recurring', type: () => SubscriptionRecurring })
    recurring: SubscriptionRecurring,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    const session = await this.service.createCheckoutSession({
      user,
      recurring,
      redirectUrl: `${this.config.baseUrl}/upgrade-success`,
      idempotencyKey,
    });

    if (!session.url) {
      throw new GraphQLError('Failed to create checkout session', {
        extensions: {
          status: HttpStatus[HttpStatus.BAD_GATEWAY],
          code: HttpStatus.BAD_GATEWAY,
        },
      });
    }

    return session.url;
  }

  @Mutation(() => String, {
    description: 'Create a stripe customer portal to manage payment methods',
  })
  async createCustomerPortal(@CurrentUser() user: User) {
    return this.service.createCustomerPortal(user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async cancelSubscription(
    @CurrentUser() user: User,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    return this.service.cancelSubscription(idempotencyKey, user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async resumeSubscription(
    @CurrentUser() user: User,
    @Args('idempotencyKey') idempotencyKey: string
  ) {
    return this.service.resumeCanceledSubscription(idempotencyKey, user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async updateSubscriptionRecurring(
    @CurrentUser() user: User,
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
  constructor(private readonly db: PrismaService) {}

  @ResolveField(() => UserSubscriptionType, { nullable: true })
  async subscription(@CurrentUser() me: User, @Parent() user: User) {
    if (me.id !== user.id) {
      throw new GraphQLError(
        'You are not allowed to access this subscription',
        {
          extensions: {
            status: HttpStatus[HttpStatus.FORBIDDEN],
            code: HttpStatus.FORBIDDEN,
          },
        }
      );
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
      throw new GraphQLError('You are not allowed to access this invoices', {
        extensions: {
          status: HttpStatus[HttpStatus.FORBIDDEN],
          code: HttpStatus.FORBIDDEN,
        },
      });
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
