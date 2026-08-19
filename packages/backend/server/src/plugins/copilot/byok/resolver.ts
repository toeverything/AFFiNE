import { BadRequestException } from '@nestjs/common';
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
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { PermissionAccess } from '../../../core/permission';
import { WorkspaceType } from '../../../core/workspaces';
import { Models } from '../../../models';
import { llmGetByokCatalog } from '../../../native';
import { CopilotEnabled } from '../feature';
import { ByokEntitlementPolicy } from './policy';
import {
  ByokAttachmentKind,
  ByokAttachmentSource,
  ByokCustomEndpointMode,
  ByokEndpointKind,
  ByokModelFeature,
  ByokModelInput,
  ByokModelOutput,
  ByokOpenAiDialect,
  ByokProbeOperation,
  ByokProbeStatusKind,
  ByokProvider,
  ByokProviderSource,
} from './types';

@ObjectType()
class WorkspaceByokCapabilityType {
  @Field(() => [ByokModelInput])
  input!: ByokModelInput[];

  @Field(() => [ByokModelOutput])
  output!: ByokModelOutput[];

  @Field(() => [ByokModelFeature])
  features!: ByokModelFeature[];

  @Field(() => [ByokAttachmentKind])
  attachmentKinds!: ByokAttachmentKind[];

  @Field(() => [ByokAttachmentSource])
  attachmentSources!: ByokAttachmentSource[];
}

@ObjectType()
class WorkspaceByokModelDeclarationType {
  @Field(() => String)
  modelId!: string;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => [WorkspaceByokCapabilityType])
  capabilities!: WorkspaceByokCapabilityType[];
}

@ObjectType()
class WorkspaceByokEndpointType {
  @Field(() => ByokEndpointKind)
  kind!: ByokEndpointKind;

  @Field(() => String, { nullable: true })
  url!: string | null;

  @Field(() => ByokOpenAiDialect, { nullable: true })
  dialect!: ByokOpenAiDialect | null;
}

@ObjectType()
class WorkspaceByokProfileDefinitionType {
  @Field(() => WorkspaceByokEndpointType)
  endpoint!: WorkspaceByokEndpointType;

  @Field(() => [WorkspaceByokModelDeclarationType])
  models!: WorkspaceByokModelDeclarationType[];
}

@ObjectType()
class WorkspaceByokProbeStatusType {
  @Field(() => ByokProbeStatusKind)
  kind!: ByokProbeStatusKind;

  @Field(() => Date, { nullable: true })
  testedAt!: Date | null;

  @Field(() => String, { nullable: true })
  errorKind!: string | null;
}

@ObjectType()
class WorkspaceByokModelProbeCheckType {
  @Field(() => ByokProbeOperation)
  operation!: ByokProbeOperation;

  @Field(() => WorkspaceByokProbeStatusType)
  status!: WorkspaceByokProbeStatusType;
}

@ObjectType()
class WorkspaceByokModelProbeType {
  @Field(() => String)
  modelId!: string;

  @Field(() => [WorkspaceByokModelProbeCheckType])
  checks!: WorkspaceByokModelProbeCheckType[];
}

@ObjectType()
class WorkspaceByokValidationType {
  @Field(() => String)
  definitionFingerprint!: string;

  @Field(() => SafeIntResolver)
  credentialGeneration!: number;

  @Field(() => WorkspaceByokProbeStatusType)
  connection!: WorkspaceByokProbeStatusType;

  @Field(() => [WorkspaceByokModelProbeType])
  models!: WorkspaceByokModelProbeType[];
}

@ObjectType()
class WorkspaceByokProbeResultType {
  @Field(() => String)
  definitionFingerprint!: string;

  @Field(() => Boolean)
  stale!: boolean;

  @Field(() => WorkspaceByokProbeStatusType)
  connection!: WorkspaceByokProbeStatusType;

  @Field(() => [WorkspaceByokModelProbeType])
  models!: WorkspaceByokModelProbeType[];
}

@ObjectType()
export class WorkspaceByokProfileType {
  @Field(() => ID)
  profileId!: string;

  @Field(() => String)
  workspaceId!: string;

  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => WorkspaceByokProfileDefinitionType)
  definition!: WorkspaceByokProfileDefinitionType;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => SafeIntResolver)
  sortOrder!: number;

  @Field(() => SafeIntResolver)
  revision!: number;

  @Field(() => WorkspaceByokValidationType, { nullable: true })
  validation!: WorkspaceByokValidationType | null;
}

@ObjectType()
class WorkspaceByokCatalogModelType {
  @Field(() => String)
  modelId!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => Boolean)
  recommended!: boolean;

  @Field(() => [WorkspaceByokCapabilityType])
  capabilities!: WorkspaceByokCapabilityType[];
}

@ObjectType()
class WorkspaceByokCatalogProviderType {
  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => [WorkspaceByokCatalogModelType])
  models!: WorkspaceByokCatalogModelType[];
}

@ObjectType()
class WorkspaceByokCatalogType {
  @Field(() => String)
  version!: string;

  @Field(() => [WorkspaceByokCatalogProviderType])
  providers!: WorkspaceByokCatalogProviderType[];
}

@ObjectType()
class WorkspaceByokPolicyType {
  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => [ByokProvider])
  allowedProviders!: ByokProvider[];

  @Field(() => ByokCustomEndpointMode)
  customEndpointMode!: ByokCustomEndpointMode;

  @Field(() => Boolean)
  privateEndpointSupported!: boolean;
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

  @Field(() => [WorkspaceByokProfileType])
  profiles!: WorkspaceByokProfileType[];

  @Field(() => WorkspaceByokPolicyType)
  policy!: WorkspaceByokPolicyType;

  @Field(() => WorkspaceByokCatalogType)
  catalog!: WorkspaceByokCatalogType;
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
class CreateWorkspaceByokLocalLeaseResultType {
  @Field(() => String)
  leaseId!: string;

  @Field(() => Date)
  expiresAt!: Date;
}

@InputType()
class WorkspaceByokCapabilityInput {
  @Field(() => [ByokModelInput])
  input!: ByokModelInput[];

  @Field(() => [ByokModelOutput])
  output!: ByokModelOutput[];

  @Field(() => [ByokModelFeature])
  features!: ByokModelFeature[];

  @Field(() => [ByokAttachmentKind])
  attachmentKinds!: ByokAttachmentKind[];

  @Field(() => [ByokAttachmentSource])
  attachmentSources!: ByokAttachmentSource[];
}

@InputType()
class WorkspaceByokModelDeclarationInput {
  @Field(() => String)
  modelId!: string;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => [WorkspaceByokCapabilityInput])
  capabilities!: WorkspaceByokCapabilityInput[];
}

@InputType()
class WorkspaceByokEndpointInput {
  @Field(() => ByokEndpointKind)
  kind!: ByokEndpointKind;

  @Field(() => String, { nullable: true })
  url!: string | null;

  @Field(() => ByokOpenAiDialect, { nullable: true })
  dialect!: ByokOpenAiDialect | null;
}

@InputType()
class WorkspaceByokProfileDefinitionInput {
  @Field(() => WorkspaceByokEndpointInput)
  endpoint!: WorkspaceByokEndpointInput;

  @Field(() => [WorkspaceByokModelDeclarationInput])
  models!: WorkspaceByokModelDeclarationInput[];
}

@InputType()
class CreateWorkspaceByokProfileInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String)
  credential!: string;

  @Field(() => WorkspaceByokProfileDefinitionInput)
  definition!: WorkspaceByokProfileDefinitionInput;

  @Field(() => Boolean)
  enabled!: boolean;
}

@InputType()
class ReplaceWorkspaceByokProfileInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ID)
  profileId!: string;

  @Field(() => SafeIntResolver)
  expectedRevision!: number;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => WorkspaceByokProfileDefinitionInput)
  definition!: WorkspaceByokProfileDefinitionInput;

  @Field(() => String, { nullable: true })
  credential!: string | null;

  @Field(() => Boolean)
  enabled!: boolean;
}

@InputType()
class RotateWorkspaceByokCredentialInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ID)
  profileId!: string;

  @Field(() => SafeIntResolver)
  expectedRevision!: number;

  @Field(() => String)
  credential!: string;
}

@InputType()
class WorkspaceByokProbeCheckInput {
  @Field(() => String)
  modelId!: string;

  @Field(() => ByokProbeOperation)
  operation!: ByokProbeOperation;
}

@InputType()
class ProbeWorkspaceByokProfileInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ID)
  profileId!: string;

  @Field(() => [WorkspaceByokProbeCheckInput])
  checks!: WorkspaceByokProbeCheckInput[];
}

@InputType()
class ProbeWorkspaceByokDraftInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String, { nullable: true })
  credential!: string | null;

  @Field(() => ID, { nullable: true })
  profileId!: string | null;

  @Field(() => SafeIntResolver, { nullable: true })
  expectedRevision!: number | null;

  @Field(() => WorkspaceByokProfileDefinitionInput)
  definition!: WorkspaceByokProfileDefinitionInput;

  @Field(() => [WorkspaceByokProbeCheckInput])
  checks!: WorkspaceByokProbeCheckInput[];
}

@InputType()
class WorkspaceByokProfileOrderInput {
  @Field(() => ID)
  profileId!: string;

  @Field(() => SafeIntResolver)
  expectedRevision!: number;
}

@InputType()
class ReorderWorkspaceByokProfilesInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => [WorkspaceByokProfileOrderInput])
  profiles!: WorkspaceByokProfileOrderInput[];
}

@InputType()
class CreateWorkspaceByokLocalLeaseProviderInput {
  @Field(() => ByokProvider)
  provider!: ByokProvider;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String)
  credential!: string;

  @Field(() => WorkspaceByokProfileDefinitionInput)
  definition!: WorkspaceByokProfileDefinitionInput;

  @Field(() => Boolean)
  enabled!: boolean;
}

@InputType()
class CreateWorkspaceByokLocalLeaseInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => [CreateWorkspaceByokLocalLeaseProviderInput])
  providers!: CreateWorkspaceByokLocalLeaseProviderInput[];
}

@CopilotEnabled()
@Resolver(() => WorkspaceType)
export class WorkspaceByokResolver {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly entitlement: ByokEntitlementPolicy,
    private readonly runtime: BackendRuntimeProvider,
    private readonly models: Models
  ) {}

  @ResolveField(() => WorkspaceByokSettingsType, {
    name: 'byokSettings',
    complexity: 2,
  })
  async settings(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    await this.assertRead(user.id, workspace.id);
    await this.entitlement.assertManagementAccess(workspace.id, user.id);
    const [serverEntitled, localEntitled] =
      await this.entitlement.hasEntitlement(workspace.id, user.id);
    const profiles = serverEntitled
      ? await this.runtime.listByokProfiles(workspace.id)
      : [];
    const policy = await this.runtime.getByokPolicy();
    const allowedProviders = new Set(policy.allowedProviders);
    const catalog = llmGetByokCatalog();
    return {
      workspaceId: workspace.id,
      entitled: serverEntitled || localEntitled,
      serverEntitled,
      localEntitled,
      profiles: profiles.map(profile => projectProfile(profile)),
      policy: {
        ...policy,
        allowedProviders: policy.allowedProviders as ByokProvider[],
        customEndpointMode: policy.customEndpointMode as ByokCustomEndpointMode,
      },
      catalog: {
        ...catalog,
        providers: catalog.providers
          .filter(provider => allowedProviders.has(provider.provider))
          .map(provider => ({
            ...provider,
            provider: provider.provider as ByokProvider,
          })),
      },
    };
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
    await this.assertRead(user.id, workspace.id);
    await this.entitlement.assertManagementAccess(workspace.id, user.id);
    return await this.models.copilotUsage.aggregateByDay({
      workspaceId: workspace.id,
      from,
      to,
      providerSources: [ByokProviderSource.Server, ByokProviderSource.Local],
    });
  }

  @Mutation(() => WorkspaceByokProfileType)
  @Throttle('strict')
  async createWorkspaceByokProfile(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: CreateWorkspaceByokProfileInput
  ) {
    await this.assertUpdate(user.id, input.workspaceId);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    requireExplicitDescription(input);
    return projectProfile(
      await this.runtime.createByokProfile({
        ...input,
        description: input.description ?? undefined,
        definition: nativeDefinition(input.definition),
        actorUserId: user.id,
      })
    );
  }

  @Mutation(() => WorkspaceByokProfileType)
  @Throttle('strict')
  async replaceWorkspaceByokProfile(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: ReplaceWorkspaceByokProfileInput
  ) {
    await this.assertUpdate(user.id, input.workspaceId);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    requireExplicitDescription(input);
    return projectProfile(
      await this.runtime.replaceByokProfile({
        ...input,
        description: input.description ?? undefined,
        credential: input.credential ?? undefined,
        definition: nativeDefinition(input.definition),
        actorUserId: user.id,
      })
    );
  }

  @Mutation(() => WorkspaceByokProfileType)
  @Throttle('strict')
  async rotateWorkspaceByokCredential(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: RotateWorkspaceByokCredentialInput
  ) {
    await this.assertUpdate(user.id, input.workspaceId);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    return projectProfile(
      await this.runtime.rotateByokCredential({
        ...input,
        actorUserId: user.id,
      })
    );
  }

  @Mutation(() => WorkspaceByokProbeResultType)
  @Throttle('strict')
  async probeWorkspaceByokProfile(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: ProbeWorkspaceByokProfileInput
  ) {
    await this.assertUpdate(user.id, input.workspaceId);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    return projectProbeResult(await this.runtime.probeByokProfile(input));
  }

  @Mutation(() => WorkspaceByokProbeResultType)
  @Throttle('strict')
  async probeWorkspaceByokDraft(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: ProbeWorkspaceByokDraftInput
  ) {
    await this.assertUpdate(user.id, input.workspaceId);
    if (input.profileId) {
      await this.entitlement.assertServerEntitled(input.workspaceId);
    } else {
      await this.entitlement.assertEntitled(input.workspaceId, user.id);
    }
    return projectProbeResult(
      await this.runtime.probeByokDraft({
        ...input,
        credential: input.credential ?? undefined,
        profileId: input.profileId ?? undefined,
        expectedRevision: input.expectedRevision ?? undefined,
        definition: nativeDefinition(input.definition),
      })
    );
  }

  @Mutation(() => Boolean)
  @Throttle('strict')
  async deleteWorkspaceByokProfile(
    @CurrentUser() user: CurrentUser,
    @Args('profileId', { type: () => ID }) profileId: string,
    @Args('workspaceId', { type: () => String }) workspaceId: string
  ) {
    await this.assertUpdate(user.id, workspaceId);
    await this.entitlement.assertServerEntitled(workspaceId);
    return await this.runtime.deleteByokProfile(workspaceId, profileId);
  }

  @Mutation(() => [WorkspaceByokProfileType])
  @Throttle('strict')
  async reorderWorkspaceByokProfiles(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: ReorderWorkspaceByokProfilesInput
  ) {
    await this.assertUpdate(user.id, input.workspaceId);
    await this.entitlement.assertServerEntitled(input.workspaceId);
    return (
      await this.runtime.reorderByokProfiles({
        ...input,
        actorUserId: user.id,
      })
    ).map(profile => projectProfile(profile));
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
    input.providers.forEach(requireExplicitDescription);
    const result = await this.runtime.createByokLocalLease({
      ...input,
      providers: input.providers.map(provider => ({
        ...provider,
        description: provider.description ?? undefined,
        definition: nativeDefinition(provider.definition),
      })),
      userId: user.id,
    });
    return {
      leaseId: result.leaseId,
      expiresAt: new Date(result.expiresAtMs),
    };
  }

  private async assertRead(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Read');
  }

  private async assertUpdate(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Settings.Update');
    await this.entitlement.assertManagementAccess(workspaceId, userId);
  }
}

function requireExplicitDescription(input: { description: string | null }) {
  if (!Object.hasOwn(input, 'description')) {
    throw new BadRequestException('description must be provided explicitly.');
  }
}

function nativeDefinition(input: WorkspaceByokProfileDefinitionInput) {
  return {
    ...input,
    endpoint: {
      ...input.endpoint,
      url: input.endpoint.url ?? undefined,
      dialect: input.endpoint.dialect ?? undefined,
    },
  };
}

function projectProbe(probe: {
  kind: string;
  testedAtMs?: number;
  errorKind?: string;
}) {
  return {
    kind: probe.kind,
    testedAt: probe.testedAtMs ? new Date(probe.testedAtMs) : null,
    errorKind: probe.errorKind ?? null,
  };
}

function projectProbeResult(result: {
  definitionFingerprint: string;
  stale: boolean;
  connection: {
    kind: string;
    testedAtMs?: number;
    errorKind?: string;
  };
  models: Array<{
    modelId: string;
    checks: Array<{
      operation: string;
      status: {
        kind: string;
        testedAtMs?: number;
        errorKind?: string;
      };
    }>;
  }>;
}) {
  return {
    ...result,
    connection: projectProbe(result.connection),
    models: result.models.map(model => ({
      ...model,
      checks: model.checks.map(check => ({
        ...check,
        status: projectProbe(check.status),
      })),
    })),
  };
}

function projectProfile(
  profile: Awaited<ReturnType<BackendRuntimeProvider['createByokProfile']>>
) {
  return {
    ...profile,
    provider: profile.provider as ByokProvider,
    validation: profile.validation
      ? {
          ...profile.validation,
          connection: projectProbe(profile.validation.connection),
          models: profile.validation.models.map(model => ({
            ...model,
            checks: model.checks.map(check => ({
              ...check,
              status: projectProbe(check.status),
            })),
          })),
        }
      : null,
  };
}
