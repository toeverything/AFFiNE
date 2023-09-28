import { InternalServerErrorException } from '@nestjs/common';
import {
  Args,
  Field,
  Int,
  Mutation,
  ObjectType,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { User, UserInvoice, UserSubscription } from '@prisma/client';

import { Config, SubscriptionPlan } from '../../config';
import { PrismaService } from '../../prisma';
import { Auth, CurrentUser } from '../auth';
import { UserType } from '../users';
import {
  InvoiceStatus,
  SubscriptionService,
  SubscriptionStatus,
} from './service';

registerEnumType(SubscriptionStatus, { name: 'SubscriptionStatus' });
registerEnumType(SubscriptionPlan, { name: 'SubscriptionPlan' });
registerEnumType(InvoiceStatus, { name: 'InvoiceStatus' });

@ObjectType('UserSubscription')
class UserSubscriptionType implements Partial<UserSubscription> {
  @Field({ name: 'id' })
  stripeSubscriptionId!: string;

  @Field(() => SubscriptionPlan)
  plan!: SubscriptionPlan;

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

  @Field()
  currency!: string;

  @Field()
  price!: number;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field(() => String, { nullable: true })
  lastPaymentError?: string | null;

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

  @Mutation(() => String, {
    description: 'Create a subscription checkout link of stripe',
  })
  async checkout(
    @CurrentUser() user: User,
    @Args({ name: 'plan', type: () => SubscriptionPlan }) plan: SubscriptionPlan
  ) {
    const session = await this.service.createCheckoutSession({
      user,
      plan,
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

  @Mutation(() => UserSubscriptionType)
  async cancelSubscription(@CurrentUser() user: User) {
    return this.service.cancelSubscription(user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async resumeSubscription(@CurrentUser() user: User) {
    return this.service.resumeCanceledSubscriptin(user.id);
  }

  @Mutation(() => UserSubscriptionType)
  async updateSubscriptionPlan(
    @CurrentUser() user: User,
    @Args({ name: 'plan', type: () => SubscriptionPlan }) plan: SubscriptionPlan
  ) {
    return this.service.updateSubscriptionPlan(user.id, plan);
  }
}

@Resolver(() => UserType)
export class UserSubscriptionResolver {
  constructor(private readonly db: PrismaService) {}

  @ResolveField(() => UserSubscriptionType, { nullable: true })
  async subscription(@Parent() user: User) {
    return this.db.userSubscription.findUnique({
      where: {
        userId: user.id,
      },
    });
  }

  @ResolveField(() => [UserInvoiceType])
  async invoices(
    @Parent() user: User,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 8 })
    take: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number
  ) {
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
