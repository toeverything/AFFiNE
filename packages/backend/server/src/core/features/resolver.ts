import { BadRequestException } from '@nestjs/common';
import {
  Args,
  Context,
  Int,
  Mutation,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { CurrentUser } from '../auth/current-user';
import { sessionUser } from '../auth/service';
import { Admin } from '../common';
import { UserService } from '../user/service';
import { UserType } from '../user/types';
import { EarlyAccessType, FeatureManagementService } from './management';
import { FeatureType } from './types';

registerEnumType(EarlyAccessType, {
  name: 'EarlyAccessType',
});

@Resolver(() => UserType)
export class FeatureManagementResolver {
  constructor(
    private readonly users: UserService,
    private readonly feature: FeatureManagementService
  ) {}

  @ResolveField(() => [FeatureType], {
    name: 'features',
    description: 'Enabled features of a user',
  })
  async userFeatures(@CurrentUser() user: CurrentUser) {
    return this.feature.getActivatedUserFeatures(user.id);
  }

  @Admin()
  @Mutation(() => Int)
  async addToEarlyAccess(
    @Args('email') email: string,
    @Args({ name: 'type', type: () => EarlyAccessType }) type: EarlyAccessType
  ): Promise<number> {
    const user = await this.users.findUserByEmail(email);
    if (user) {
      return this.feature.addEarlyAccess(user.id, type);
    } else {
      const user = await this.users.createAnonymousUser(email, {
        registered: false,
      });
      return this.feature.addEarlyAccess(user.id, type);
    }
  }

  @Admin()
  @Mutation(() => Int)
  async removeEarlyAccess(@Args('email') email: string): Promise<number> {
    const user = await this.users.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(`User ${email} not found`);
    }
    return this.feature.removeEarlyAccess(user.id);
  }

  @Admin()
  @Query(() => [UserType])
  async earlyAccessUsers(
    @Context() ctx: { isAdminQuery: boolean }
  ): Promise<UserType[]> {
    // allow query other user's subscription
    ctx.isAdminQuery = true;
    return this.feature.listEarlyAccess().then(users => {
      return users.map(sessionUser);
    });
  }

  @Admin()
  @Mutation(() => Boolean)
  async addAdminister(@Args('email') email: string): Promise<boolean> {
    const user = await this.users.findUserByEmail(email);

    if (!user) {
      throw new BadRequestException(`User ${email} not found`);
    }

    await this.feature.addAdmin(user.id);

    return true;
  }
}
