import {
  Args,
  Field,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import { assertAccessTokenCanUseDocAction } from '../../access-token';
import { AnonymousDocAccessService } from '../../anonymous-doc-access';
import {
  CurrentAccessToken,
  CurrentUser,
  Public,
  TokenSession,
} from '../../auth';
import { AccessController, DocRole } from '../../permission';

@ObjectType()
class AnonymousDocAccessLinkType {
  @Field()
  id!: string;

  @Field()
  workspaceId!: string;

  @Field()
  docId!: string;

  @Field(() => DocRole)
  role!: DocRole;

  @Field()
  enabled!: boolean;

  @Field(() => Date, { nullable: true })
  revokedAt!: Date | null;

  @Field()
  createdByUserId!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
class CreatedAnonymousDocAccessLinkType extends AnonymousDocAccessLinkType {
  @Field()
  token!: string;
}

@ObjectType()
class AnonymousDocGuestSessionType {
  @Field()
  id!: string;

  @Field()
  linkId!: string;

  @Field()
  workspaceId!: string;

  @Field()
  docId!: string;

  @Field()
  guestId!: string;

  @Field()
  displayName!: string;

  @Field()
  color!: string;

  @Field(() => Date, { nullable: true })
  revertedAt!: Date | null;

  @Field()
  lastSeenAt!: Date;

  @Field()
  createdAt!: Date;
}

@ObjectType()
class ResolvedAnonymousDocAccessType {
  @Field(() => AnonymousDocAccessLinkType)
  link!: AnonymousDocAccessLinkType;

  @Field(() => AnonymousDocGuestSessionType)
  guest!: AnonymousDocGuestSessionType;

  @Field()
  guestToken!: string;
}

@ObjectType()
class AnonymousDocUpdateType {
  @Field()
  id!: string;

  @Field()
  linkId!: string;

  @Field()
  guestSessionId!: string;

  @Field()
  workspaceId!: string;

  @Field()
  docId!: string;

  @Field()
  timestamp!: Date;

  @Field()
  createdAt!: Date;
}

@InputType()
class AnonymousDocAccessInput {
  @Field()
  workspaceId!: string;

  @Field()
  docId!: string;
}

@Resolver()
export class AnonymousDocAccessResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly anonymous: AnonymousDocAccessService
  ) {}

  @Mutation(() => CreatedAnonymousDocAccessLinkType)
  async createAnonymousDocAccessLink(
    @CurrentUser() user: CurrentUser,
    @CurrentAccessToken() token: TokenSession | undefined,
    @Args('input') input: AnonymousDocAccessInput
  ) {
    assertAccessTokenCanUseDocAction(
      token,
      input.workspaceId,
      input.docId,
      'Doc.Users.Manage'
    );
    await this.ac.user(user.id).doc(input).assert('Doc.Users.Manage');

    return await this.anonymous.createLink(
      input.workspaceId,
      input.docId,
      user.id
    );
  }

  @Mutation(() => AnonymousDocAccessLinkType, { nullable: true })
  async revokeAnonymousDocAccessLink(
    @CurrentUser() user: CurrentUser,
    @CurrentAccessToken() token: TokenSession | undefined,
    @Args('workspaceId') workspaceId: string,
    @Args('docId') docId: string,
    @Args('linkId') linkId: string
  ) {
    assertAccessTokenCanUseDocAction(
      token,
      workspaceId,
      docId,
      'Doc.Users.Manage'
    );
    await this.ac
      .user(user.id)
      .doc({ workspaceId, docId })
      .assert('Doc.Users.Manage');

    return await this.anonymous.revokeLink(workspaceId, docId, linkId);
  }

  @Query(() => [AnonymousDocAccessLinkType])
  async anonymousDocAccessLinks(
    @CurrentUser() user: CurrentUser,
    @CurrentAccessToken() token: TokenSession | undefined,
    @Args('workspaceId') workspaceId: string,
    @Args('docId') docId: string
  ) {
    assertAccessTokenCanUseDocAction(
      token,
      workspaceId,
      docId,
      'Doc.Users.Manage'
    );
    await this.ac
      .user(user.id)
      .doc({ workspaceId, docId })
      .assert('Doc.Users.Manage');

    return await this.anonymous.listLinks(workspaceId, docId);
  }

  @Public()
  @Mutation(() => ResolvedAnonymousDocAccessType)
  async resolveAnonymousDocAccessLink(
    @Args('token') token: string,
    @Args('displayName', { nullable: true }) displayName?: string
  ) {
    return await this.anonymous.resolveLink(token, displayName);
  }

  @Query(() => [AnonymousDocUpdateType])
  async anonymousDocGuestUpdates(
    @CurrentUser() user: CurrentUser,
    @CurrentAccessToken() token: TokenSession | undefined,
    @Args('workspaceId') workspaceId: string,
    @Args('docId') docId: string,
    @Args('guestSessionId') guestSessionId: string
  ) {
    assertAccessTokenCanUseDocAction(
      token,
      workspaceId,
      docId,
      'Doc.Users.Manage'
    );
    await this.ac
      .user(user.id)
      .doc({ workspaceId, docId })
      .assert('Doc.Users.Manage');

    return await this.anonymous.listGuestUpdates(
      workspaceId,
      docId,
      guestSessionId
    );
  }

  @Mutation(() => Date)
  async revertAnonymousDocGuestSession(
    @CurrentUser() user: CurrentUser,
    @CurrentAccessToken() token: TokenSession | undefined,
    @Args('workspaceId') workspaceId: string,
    @Args('docId') docId: string,
    @Args('guestSessionId') guestSessionId: string
  ) {
    assertAccessTokenCanUseDocAction(token, workspaceId, docId, 'Doc.Update');
    await this.ac
      .user(user.id)
      .doc({ workspaceId, docId })
      .assert('Doc.Update');

    return await this.anonymous.revertGuestSession(
      workspaceId,
      docId,
      guestSessionId,
      user.id
    );
  }
}
