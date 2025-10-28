import {
  Args,
  Field,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import { Models } from '../../models';
import { CurrentUser } from '../auth/session';

@ObjectType()
class AccessToken {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  expiresAt!: Date | null;
}

@ObjectType()
class RevealedAccessToken extends AccessToken {
  @Field()
  token!: string;
}

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

  @Query(() => [AccessToken])
  async accessTokens(@CurrentUser() user: CurrentUser): Promise<AccessToken[]> {
    return await this.models.accessToken.list(user.id);
  }

  @Query(() => [RevealedAccessToken])
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
