import {
  BadGatewayException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
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

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { Auth, CurrentUser, Public } from '../auth';
import { UserType } from '../users';
import {
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

    const yearly = prices.data.find(
      price => price.lookup_key === SubscriptionRecurring.Yearly
    );
    const monthly = prices.data.find(
      price => price.lookup_key === SubscriptionRecurring.Monthly
    );

    if (!yearly || !monthly) {
      throw new BadGatewayException('The prices are not configured correctly');
    }

    return [
      {
        type: 'fixed',
        plan: SubscriptionPlan.Pro,
        currency: monthly.currency,
        amount: monthly.unit_amount ?? 0,
        yearlyAmount: yearly.unit_amount ?? 0,
      },
    ];
  }

  @Mutation(() => String, {
    description: 'Create a subscription checkout link of stripe',
  })
  async checkout(
    @CurrentUser() user: User,
    @Args({ name: 'recurring', type: () => SubscriptionRecurring })
    recurring: SubscriptionRecurring
  ) {
    const session = await this.service.createCheckoutSession({
      user,
      recurring,
      // TODO: replace with frontend url
      redirectUrl: `${this.config.baseUrl}/api/stripe/success`,
    });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Failed to create checkout session'
      );
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
  async cancelSubscription(@CurrentUser() user: User) {
    return this.service.cancelSubscription(user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async resumeSubscription(@CurrentUser() user: User) {
    return this.service.resumeCanceledSubscriptin(user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async updateSubscriptionRecurring(
    @CurrentUser() user: User,
    @Args({ name: 'recurring', type: () => SubscriptionRecurring })
    recurring: SubscriptionRecurring
  ) {
    return this.service.updateSubscriptionRecurring(user.id, recurring);
  }
}

@Resolver(() => UserType)
export class UserSubscriptionResolver {
  constructor(private readonly db: PrismaService) {}

  @ResolveField(() => UserSubscriptionType, { nullable: true })
  async subscription(@CurrentUser() me: User, @Parent() user: User) {
    if (me.id !== user.id) {
      throw new ForbiddenException();
    }

    return this.db.userSubscription.findUnique({
      where: {
        userId: user.id,
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
      throw new ForbiddenException();
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
