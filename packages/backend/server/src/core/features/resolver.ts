import {
  Args,
  Context,
  Int,
  Mutation,
  Parent,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { UserNotFound } from '../../fundamentals';
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
  async userFeatures(@Parent() user: UserType) {
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
      const user = await this.users.createUser({
        email,
        registered: false,
      });
      return this.feature.addEarlyAccess(user.id, type);
    }
  }

  @Admin()
  @Mutation(() => Int)
  async removeEarlyAccess(
    @Args('email') email: string,
    @Args({ name: 'type', type: () => EarlyAccessType }) type: EarlyAccessType
  ): Promise<number> {
    const user = await this.users.findUserByEmail(email);
    if (!user) {
      throw new UserNotFound();
    }
    return this.feature.removeEarlyAccess(user.id, type);
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
      throw new UserNotFound();
    }

    await this.feature.addAdmin(user.id);

    return true;
  }

  @Admin()
  @Mutation(() => Boolean)
  async removeAdminister(@Args('email') email: string): Promise<boolean> {
    const user = await this.users.findUserByEmail(email);

    if (!user) {
      throw new UserNotFound();
    }

    await this.feature.removeAdmin(user.id);

    return true;
  }
}
