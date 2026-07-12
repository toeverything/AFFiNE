import { BadRequestException } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  registerEnumType,
  Resolver,
} from '@nestjs/graphql';
import { McpAccessMode } from '@prisma/client';

import { CurrentUser } from '../../../core/auth';
import { PermissionAccess } from '../../../core/permission';
import { McpCredentialService } from './credential';

registerEnumType(McpAccessMode, { name: 'McpAccessMode' });

enum McpCredentialStatus {
  ACTIVE = 'ACTIVE',
  ROTATING = 'ROTATING',
  EXPIRING = 'EXPIRING',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

registerEnumType(McpCredentialStatus, { name: 'McpCredentialStatus' });

@ObjectType()
export class McpCredentialType {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  workspaceId!: string;

  @Field(() => McpAccessMode)
  accessMode!: McpAccessMode;

  @Field()
  fingerprint!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  expiresAt!: Date;

  @Field(() => Date, { nullable: true })
  lastUsedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  revokedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  graceEndsAt!: Date | null;

  @Field(() => McpCredentialStatus)
  status!: McpCredentialStatus;
}

@ObjectType()
class RevealedMcpCredentialType {
  @Field(() => McpCredentialType)
  credential!: McpCredentialType;

  @Field()
  token!: string;
}

@InputType()
class CreateMcpCredentialInput {
  @Field()
  workspaceId!: string;

  @Field()
  name!: string;

  @Field(() => McpAccessMode, { defaultValue: McpAccessMode.READ_ONLY })
  accessMode!: McpAccessMode;

  @Field(() => Int, { defaultValue: 90 })
  expirationDays!: number;
}

@Resolver()
export class McpCredentialResolver {
  constructor(
    private readonly credentials: McpCredentialService,
    private readonly ac: PermissionAccess
  ) {}

  @Query(() => [McpCredentialType])
  async mcpCredentials(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac.user(user.id).workspace(workspaceId).assert('Workspace.Read');
    return await this.credentials.list(user.id, workspaceId);
  }

  @Query(() => Boolean)
  mcpCredentialReadWriteAvailable() {
    return env.dev || env.namespaces.canary;
  }

  @Mutation(() => RevealedMcpCredentialType)
  async createMcpCredential(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: CreateMcpCredentialInput
  ) {
    if (
      input.accessMode === McpAccessMode.READ_WRITE &&
      !env.dev &&
      !env.namespaces.canary
    ) {
      throw new BadRequestException('MCP write tools are not available');
    }
    await this.ac
      .user(user.id)
      .workspace(input.workspaceId)
      .assert('Workspace.Read');
    return await this.credentials.create({ ...input, userId: user.id });
  }

  @Mutation(() => RevealedMcpCredentialType)
  async rotateMcpCredential(
    @CurrentUser() user: CurrentUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('workspaceId') workspaceId: string,
    @Args('expirationDays', { type: () => Int, defaultValue: 90 })
    expirationDays: number
  ) {
    await this.ac.user(user.id).workspace(workspaceId).assert('Workspace.Read');
    return await this.credentials.rotate(
      id,
      user.id,
      workspaceId,
      expirationDays
    );
  }

  @Mutation(() => Boolean)
  async revokeMcpCredential(
    @CurrentUser() user: CurrentUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac.user(user.id).workspace(workspaceId).assert('Workspace.Read');
    return await this.credentials.revoke(id, user.id, workspaceId);
  }
}
