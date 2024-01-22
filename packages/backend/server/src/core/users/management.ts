import {
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CloudThrottlerGuard, Throttle } from '../../fundamentals';
import { Auth, CurrentUser } from '../auth/guard';
import { AuthService } from '../auth/service';
import { FeatureManagementService } from '../features';
import { UserType } from './types';
import { UsersService } from './users';

/**
 * User resolver
 * All op rate limit: 10 req/m
 */
@UseGuards(CloudThrottlerGuard)
@Auth()
@Resolver(() => UserType)
export class UserManagementResolver {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly feature: FeatureManagementService
  ) {}

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => Int)
  async addToEarlyAccess(
    @CurrentUser() currentUser: UserType,
    @Args('email') email: string
  ): Promise<number> {
    if (!this.feature.isStaff(currentUser.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }
    const user = await this.users.findUserByEmail(email);
    if (user) {
      return this.feature.addEarlyAccess(user.id);
    } else {
      const user = await this.auth.createAnonymousUser(email);
      return this.feature.addEarlyAccess(user.id);
    }
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => Int)
  async removeEarlyAccess(
    @CurrentUser() currentUser: UserType,
    @Args('email') email: string
  ): Promise<number> {
    if (!this.feature.isStaff(currentUser.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }
    const user = await this.users.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(`User ${email} not found`);
    }
    return this.feature.removeEarlyAccess(user.id);
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Query(() => [UserType])
  async earlyAccessUsers(
    @Context() ctx: { isAdminQuery: boolean },
    @CurrentUser() user: UserType
  ): Promise<UserType[]> {
    if (!this.feature.isStaff(user.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }
    // allow query other user's subscription
    ctx.isAdminQuery = true;
    return this.feature.listEarlyAccess();
  }
}
