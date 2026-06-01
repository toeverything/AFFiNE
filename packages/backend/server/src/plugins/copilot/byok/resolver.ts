import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { SafeIntResolver } from 'graphql-scalars';

import { Throttle } from '../../../base';
import { CurrentUser } from '../../../core/auth';
import { PermissionAccess } from '../../../core/permission';
import { WorkspaceType } from '../../../core/workspaces';
import { ByokEntitlementPolicy } from './policy';
import { ByokKeyConfig, ByokLocalLeaseProvider, ByokService } from './service';
import { ByokKeyStorage, ByokKeyTestStatus, ByokProvider } from './types';

@ObjectType()
export class WorkspaceByokKeyConfigType implements ByokKeyConfig {
  @Field(() => ID)
  id!: string;

  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => ByokKeyStorage)
  storage!: ByokKeyStorage;

  @Field(() => Boolean)
  configured!: boolean;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => String, { nullable: true })
  endpoint!: string | null;

  @Field(() => Boolean)
  endpointEditable!: boolean;

  @Field(() => SafeIntResolver)
  sortOrder!: number;

  @Field(() => [String])
  capabilities!: string[];

  @Field(() => ByokKeyTestStatus)
  testStatus!: ByokKeyTestStatus;

  @Field(() => String, { nullable: true })
  disabledReason!: string | null;

  @Field(() => Date, { nullable: true })
  lastTestedAt!: Date | null;

  @Field(() => String, { nullable: true })
  lastTestError!: string | null;

  @Field(() => Date, { nullable: true })
  lastUsedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  lastErrorAt!: Date | null;

  @Field(() => String, { nullable: true })
  lastError!: string | null;
}

@ObjectType()
class WorkspaceByokCapabilityWarningType {
  @Field(() => String)
  featureKind!: string;

  @Field(() => String)
  reason!: string;

  @Field(() => [ByokProvider])
  requiredProviders!: ByokProvider[];
}

@ObjectType()
class WorkspaceByokSettingsType {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => Boolean)
  entitled!: boolean;

  @Field(() => Boolean)
  serverEntitled!: boolean;

  @Field(() => Boolean)
  localEntitled!: boolean;

  @Field(() => [String])
  entitlementRequired!: string[];

  @Field(() => [WorkspaceByokKeyConfigType])
  keys!: WorkspaceByokKeyConfigType[];

  @Field(() => [ByokProvider])
  allowedProviders!: ByokProvider[];

  @Field(() => Boolean)
  localStorageSupported!: boolean;

  @Field(() => Boolean)
  customEndpointSupported!: boolean;

  @Field(() => Boolean)
  hasAiPlan!: boolean;

  @Field(() => [WorkspaceByokCapabilityWarningType])
  warnings!: WorkspaceByokCapabilityWarningType[];
}

@ObjectType()
class WorkspaceByokUsagePointType {
  @Field(() => Date)
  date!: Date;

  @Field(() => String)
  featureKind!: string;

  @Field(() => SafeIntResolver)
  totalTokens!: number;
}

@ObjectType()
class TestWorkspaceByokConfigResultType {
  @Field(() => Boolean)
  ok!: boolean;

  @Field(() => ByokKeyTestStatus)
  status!: ByokKeyTestStatus;

  @Field(() => String, { nullable: true })
  message!: string | null;
}

@ObjectType()
class CreateWorkspaceByokLocalLeaseResultType {
  @Field(() => String)
  leaseId!: string;

  @Field(() => Date)
  expiresAt!: Date;
}

@InputType()
class UpsertWorkspaceByokConfigInput {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field(() => String)
  workspaceId!: string;

  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => ByokKeyStorage)
  storage!: ByokKeyStorage;

  @Field(() => String, { nullable: true })
  apiKey?: string | null;

  @Field(() => String, { nullable: true })
  endpoint?: string | null;

  @Field(() => SafeIntResolver, { nullable: true })
  sortOrder?: number | null;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean | null;
}

@InputType()
class TestWorkspaceByokConfigInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => ByokKeyStorage)
  storage!: ByokKeyStorage;

  @Field(() => String, { nullable: true })
  apiKey?: string | null;

  @Field(() => String, { nullable: true })
  endpoint?: string | null;

  @Field(() => ID, { nullable: true })
  configId?: string | null;
}

@InputType()
class ReorderWorkspaceByokConfigsInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ByokKeyStorage)
  storage!: ByokKeyStorage;

  @Field(() => [ID])
  ids!: string[];
}

@InputType()
class CreateWorkspaceByokLocalLeaseProviderInput implements ByokLocalLeaseProvider {
  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String)
  apiKey!: string;

  @Field(() => String, { nullable: true })
  endpoint?: string | null;

  @Field(() => SafeIntResolver, { nullable: true })
  sortOrder?: number | null;

  @Field(() => Boolean, { nullable: true })
  enabled?: boolean | null;
}

@InputType()
class CreateWorkspaceByokLocalLeaseInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => [CreateWorkspaceByokLocalLeaseProviderInput])
  providers!: CreateWorkspaceByokLocalLeaseProviderInput[];
}

@Resolver(() => WorkspaceType)
export class WorkspaceByokResolver {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly entitlement: ByokEntitlementPolicy,
    private readonly byok: ByokService
  ) {}

  @ResolveField(() => WorkspaceByokSettingsType, {
    name: 'byokSettings',
    complexity: 2,
  })
  async settings(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .allowLocal()
      .assert('Workspace.Settings.Read');
    await this.entitlement.assertManagementAccess(workspace.id, user.id);
    return await this.byok.getSettings(workspace.id, user.id);
  }

  @ResolveField(() => [WorkspaceByokUsagePointType], {
    name: 'byokUsage',
    complexity: 2,
  })
  async usage(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('from', { type: () => Date }) from: Date,
    @Args('to', { type: () => Date }) to: Date
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .allowLocal()
      .assert('Workspace.Settings.Read');
    await this.entitlement.assertManagementAccess(workspace.id, user.id);
    return await this.byok.getUsage(workspace.id, from, to);
  }

  @Throttle('strict')
  @Mutation(() => TestWorkspaceByokConfigResultType)
  async testWorkspaceByokConfig(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: TestWorkspaceByokConfigInput
  ) {
    await this.ac
      .user(user.id)
      .workspace(input.workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Update');
    await this.entitlement.assertManagementAccess(input.workspaceId, user.id);
    if (input.storage === ByokKeyStorage.server) {
      await this.entitlement.assertServerEntitled(input.workspaceId);
    } else {
      await this.entitlement.assertLocalEntitled(input.workspaceId, user.id);
    }
    return await this.byok.testConfig({ ...input, userId: user.id });
  }

  @Mutation(() => WorkspaceByokKeyConfigType)
  @Throttle('strict')
  async upsertWorkspaceByokConfig(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: UpsertWorkspaceByokConfigInput
  ) {
    await this.ac
      .user(user.id)
      .workspace(input.workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Update');
    await this.entitlement.assertManagementAccess(input.workspaceId, user.id);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    return await this.byok.upsertConfig({ ...input, userId: user.id });
  }

  @Mutation(() => [WorkspaceByokKeyConfigType])
  @Throttle('strict')
  async reorderWorkspaceByokConfigs(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: ReorderWorkspaceByokConfigsInput
  ) {
    await this.ac
      .user(user.id)
      .workspace(input.workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Update');
    await this.entitlement.assertManagementAccess(input.workspaceId, user.id);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    return await this.byok.reorderConfigs({ ...input, userId: user.id });
  }

  @Mutation(() => Boolean)
  @Throttle('strict')
  async deleteWorkspaceByokConfig(
    @CurrentUser() user: CurrentUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('workspaceId', { type: () => String }) workspaceId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Update');
    await this.entitlement.assertManagementAccess(workspaceId, user.id);
    await this.entitlement.assertServerEntitled(workspaceId);
    return await this.byok.deleteConfig(workspaceId, id, user.id);
  }

  @Mutation(() => Boolean)
  @Throttle('strict')
  async clearWorkspaceByokConfigs(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { type: () => String }) workspaceId: string,
    @Args('provider', { type: () => ByokProvider, nullable: true })
    provider?: ByokProvider | null
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Update');
    await this.entitlement.assertManagementAccess(workspaceId, user.id);
    await this.entitlement.assertServerEntitled(workspaceId);
    return await this.byok.clearConfigs(workspaceId, provider, user.id);
  }

  @Mutation(() => CreateWorkspaceByokLocalLeaseResultType)
  @Throttle('strict')
  async createWorkspaceByokLocalLease(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: CreateWorkspaceByokLocalLeaseInput
  ) {
    await this.ac
      .user(user.id)
      .workspace(input.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
    await this.entitlement.assertManagementAccess(input.workspaceId, user.id);
    await this.entitlement.assertLocalEntitled(input.workspaceId, user.id);
    return await this.byok.createLocalLease({ ...input, userId: user.id });
  }
}
