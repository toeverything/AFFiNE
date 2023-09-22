import { InternalServerErrorException } from '@nestjs/common';
import {
  Args,
  Field,
  Mutation,
  ObjectType,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { User, UserSubscription } from '@prisma/client';

import { Config, SubscriptionPlan } from '../../config';
import { PrismaService } from '../../prisma';
import { Auth, CurrentUser } from '../auth';
import { UserType } from '../users';
import { PaymentService, SubscriptionStatus } from './service';

registerEnumType(SubscriptionStatus, { name: 'SubscriptionStatus' });
registerEnumType(SubscriptionPlan, { name: 'SubscriptionPlan' });

@ObjectType('UserSubscription')
class UserSubscriptionType implements Partial<UserSubscription> {
  @Field(() => SubscriptionPlan)
  plan!: SubscriptionPlan;

  @Field(() => SubscriptionStatus)
  status!: SubscriptionStatus;

  @Field(() => Date, { nullable: true })
  start?: Date | null;

  @Field(() => Date, { nullable: true })
  end?: Date | null;

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

@Auth()
@Resolver(() => UserSubscriptionType)
export class SubscriptionResolver {
  constructor(
    private readonly service: PaymentService,
    private readonly config: Config
  ) {}

  @Mutation(() => String, {
    description: 'Create a subscription checkout link of stripe',
  })
  async checkout(
    @CurrentUser() user: User,
    @Args({ name: 'plan', type: () => SubscriptionPlan }) plan: SubscriptionPlan
  ) {
    const session = await this.service.checkout({
      email: user.email,
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
}
