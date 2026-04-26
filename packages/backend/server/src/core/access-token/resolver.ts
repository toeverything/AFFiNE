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
import { DOC_ACTIONS } from '../permission';
import { UserType } from '../user';
import { AccessToken, RevealedAccessToken } from './types';

@InputType()
class GenerateAccessTokenDocScopeInput {
  @Field()
  workspaceId!: string;

  @Field({ nullable: true })
  docId?: string;

  @Field(() => [String])
  actions!: string[];
}

@InputType()
class GenerateAccessTokenScopesInput {
  @Field(() => [GenerateAccessTokenDocScopeInput], { nullable: true })
  docs?: GenerateAccessTokenDocScopeInput[];
}

@InputType()
class GenerateAccessTokenInput {
  @Field()
  name!: string;

  @Field(() => Date, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => GenerateAccessTokenScopesInput, { nullable: true })
  scopes?: GenerateAccessTokenScopesInput;
}

@Resolver(() => AccessToken)
export class AccessTokenResolver {
  constructor(private readonly models: Models) {}

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
    const scopes = normalizeScopes(input.scopes);

    return await this.models.accessToken.create({
      userId: user.id,
      name: input.name,
      expiresAt: input.expiresAt,
      scopes,
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

function normalizeScopes(input?: GenerateAccessTokenScopesInput) {
  if (!input) {
    return null;
  }

  const docs = input.docs?.map(scope => ({
    workspaceId: scope.workspaceId,
    docId: scope.docId ?? null,
    actions: [...new Set(scope.actions)],
  }));

  if (!docs?.length) {
    return null;
  }

  for (const scope of docs) {
    if (!scope.workspaceId) {
      throw new ActionForbidden('Access token doc scope requires workspaceId');
    }
    if (!scope.actions.length) {
      throw new ActionForbidden('Access token doc scope requires actions');
    }
    for (const action of scope.actions) {
      if (!DOC_ACTIONS.includes(action as any)) {
        throw new ActionForbidden(`Unsupported doc action scope: ${action}`);
      }
    }
  }

  return { docs };
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
