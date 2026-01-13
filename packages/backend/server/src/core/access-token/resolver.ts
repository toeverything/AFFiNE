import {
  Args,
  Field,
  InputType,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { ActionForbidden } from '../../base';
import { Models } from '../../models';
import { CurrentUser } from '../auth/session';
import { UserType } from '../user';
import { AccessToken, RevealedAccessToken } from './types';

@InputType()
class GenerateAccessTokenInput {
  @Field()
  name!: string;

  @Field(() => Date, { nullable: true })
  expiresAt!: Date | null;
}

@Resolver(() => AccessToken)
export class AccessTokenResolver {
  constructor(private readonly models: Models) {}

  @Query(() => [AccessToken], {
    deprecationReason: 'use currentUser.accessTokens',
  })
  async accessTokens(@CurrentUser() user: CurrentUser): Promise<AccessToken[]> {
    return await this.models.accessToken.list(user.id);
  }

  @Query(() => [RevealedAccessToken], {
    deprecationReason: 'use currentUser.revealedAccessTokens',
  })
  async revealedAccessTokens(
    @CurrentUser() user: CurrentUser
  ): Promise<RevealedAccessToken[]> {
    return await this.models.accessToken.list(user.id, true);
  }

  @Mutation(() => RevealedAccessToken)
  async generateUserAccessToken(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: GenerateAccessTokenInput
  ): Promise<RevealedAccessToken> {
    return await this.models.accessToken.create({
      userId: user.id,
      name: input.name,
      expiresAt: input.expiresAt,
    });
  }

  @Mutation(() => Boolean)
  async revokeUserAccessToken(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string
  ): Promise<boolean> {
    await this.models.accessToken.revoke(id, user.id);
    return true;
  }
}

@Resolver(() => UserType)
export class UserAccessTokenResolver {
  constructor(private readonly models: Models) {}

  @ResolveField(() => [AccessToken])
  async accessTokens(
    @CurrentUser() currentUser: CurrentUser,
    @Parent() user: UserType
  ): Promise<AccessToken[]> {
    if (!currentUser || currentUser.id !== user.id) {
      throw new ActionForbidden();
    }
    return await this.models.accessToken.list(user.id);
  }

  @ResolveField(() => [RevealedAccessToken])
  async revealedAccessTokens(
    @CurrentUser() currentUser: CurrentUser,
    @Parent() user: UserType
  ): Promise<RevealedAccessToken[]> {
    if (!currentUser || currentUser.id !== user.id) {
      throw new ActionForbidden();
    }
    return await this.models.accessToken.list(user.id, true);
  }
}
