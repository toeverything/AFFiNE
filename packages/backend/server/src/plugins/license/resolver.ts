import {
  Args,
  Field,
  Int,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import GraphQLUpload, {
  type FileUpload,
} from 'graphql-upload/GraphQLUpload.mjs';

import { toBuffer, UseNamedGuard } from '../../base';
import { CurrentUser } from '../../core/auth';
import { AccessController } from '../../core/permission';
import { WorkspaceType } from '../../core/workspaces';
import { SubscriptionRecurring, SubscriptionVariant } from '../payment/types';
import { LicenseService } from './service';

@ObjectType()
export class License {
  @Field(() => Int)
  quantity!: number;

  @Field(() => SubscriptionRecurring)
  recurring!: string;

  @Field(() => SubscriptionVariant, { nullable: true })
  variant!: string | null;

  @Field(() => Date)
  installedAt!: Date;

  @Field(() => Date)
  validatedAt!: Date;

  @Field(() => Date, { nullable: true })
  expiredAt!: Date | null;
}

@UseNamedGuard('selfhost')
@Resolver(() => WorkspaceType)
export class LicenseResolver {
  constructor(
    private readonly service: LicenseService,
    private readonly ac: AccessController
  ) {}

  @ResolveField(() => License, {
    complexity: 2,
    description: 'The selfhost license of the workspace',
    nullable: true,
  })
  async license(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ): Promise<License | null> {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Payment.Manage');
    return this.service.getLicense(workspace.id);
  }

  @Mutation(() => License)
  async activateLicense(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('license') license: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Payment.Manage');

    return this.service.activateTeamLicense(workspaceId, license);
  }

  @Mutation(() => Boolean)
  async deactivateLicense(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Payment.Manage');

    return this.service.removeTeamLicense(workspaceId);
  }

  @Mutation(() => String)
  async createSelfhostWorkspaceCustomerPortal(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Payment.Manage');

    const { url } = await this.service.createCustomerPortal(workspaceId);

    return url;
  }

  @Mutation(() => License)
  async installLicense(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('license', { type: () => GraphQLUpload }) licenseFile: FileUpload
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Payment.Manage');

    const buffer = await toBuffer(licenseFile.createReadStream());

    const license = await this.service.installLicense(workspaceId, buffer);

    return license;
  }
}
