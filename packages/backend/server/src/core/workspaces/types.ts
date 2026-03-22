import {
  Field,
  ID,
  InputType,
  ObjectType,
  OmitType,
  PartialType,
  PickType,
  registerEnumType,
} from '@nestjs/graphql';
import { WorkspaceMemberStatus } from '@prisma/client';
import { GraphQLJSONObject, SafeIntResolver } from 'graphql-scalars';

import { DocRole, WorkspaceRole } from '../permission';
import { UserType, WorkspaceUserType } from '../user/types';

registerEnumType(WorkspaceRole, {
  name: 'WorkspaceRole',
  description: 'User role in workspace',
});

// @deprecated
registerEnumType(WorkspaceRole, {
  name: 'Permission',
  description: 'User permission in workspace',
});

registerEnumType(DocRole, {
  name: 'DocRole',
  description: 'User permission in doc',
});

registerEnumType(WorkspaceMemberStatus, {
  name: 'WorkspaceMemberStatus',
  description: 'Member invite status in workspace',
});

@ObjectType()
export class InviteUserType extends OmitType(
  PartialType(UserType),
  ['id'],
  ObjectType
) {
  @Field(() => ID)
  id!: string;

  @Field(() => WorkspaceRole, {
    deprecationReason: 'Use role instead',
    description: 'User permission in workspace',
  })
  permission!: WorkspaceRole;

  @Field(() => WorkspaceRole, { description: 'User role in workspace' })
  role!: WorkspaceRole;

  @Field({ description: 'Invite id' })
  inviteId!: string;

  @Field(() => WorkspaceMemberStatus, {
    description: 'Member invite status in workspace',
  })
  status!: WorkspaceMemberStatus;
}

@ObjectType()
export class WorkspaceFeatureType {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'is Public workspace' })
  public!: boolean;

  @Field({ description: 'Workspace created date' })
  createdAt!: Date;
}

@ObjectType()
export class WorkspaceType extends WorkspaceFeatureType {
  @Field({ description: 'Enable AI' })
  enableAi!: boolean;

  @Field({ description: 'Enable workspace sharing' })
  enableSharing!: boolean;

  @Field({ description: 'Enable url previous when sharing' })
  enableUrlPreview!: boolean;

  @Field({ description: 'Enable doc embedding' })
  enableDocEmbedding!: boolean;

  @Field(() => [InviteUserType], {
    description: 'Members of workspace',
  })
  members!: InviteUserType[];
}

@ObjectType()
export class InvitationWorkspaceType {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Workspace name' })
  name!: string;

  @Field(() => String, {
    // nullable: true,
    description: 'Base64 encoded avatar',
  })
  avatar!: string;
}

@ObjectType()
export class WorkspaceBlobSizes {
  @Field(() => SafeIntResolver)
  size!: number;
}

@ObjectType()
export class InvitationType {
  @Field({ description: 'Workspace information' })
  workspace!: InvitationWorkspaceType;
  @Field({ description: 'User information' })
  user!: WorkspaceUserType;
  @Field({ description: 'Invitee information' })
  invitee!: WorkspaceUserType;
  @Field(() => WorkspaceMemberStatus, {
    description: 'Invitation status in workspace',
    nullable: true,
  })
  status?: WorkspaceMemberStatus;
}

@InputType()
export class UpdateWorkspaceInput extends PickType(
  PartialType(WorkspaceType),
  [
    'public',
    'enableAi',
    'enableSharing',
    'enableUrlPreview',
    'enableDocEmbedding',
  ],
  InputType
) {
  @Field(() => ID)
  id!: string;
}

@ObjectType()
export class InviteLink {
  @Field(() => String, { description: 'Invite link' })
  link!: string;

  @Field(() => Date, { description: 'Invite link expire time' })
  expireTime!: Date;
}

@ObjectType()
export class InviteResult {
  @Field(() => String)
  email!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Invite id, null if invite record create failed',
  })
  inviteId?: string;

  /**
   * @deprecated
   */
  @Field(() => Boolean, {
    description: 'Invite email sent success',
    deprecationReason: 'Notification will be sent asynchronously',
    defaultValue: true,
  })
  sentSuccess?: boolean;

  @Field(() => GraphQLJSONObject, {
    nullable: true,
    description: 'Invite error',
  })
  error?: object;
}

const Day = 24 * 60 * 60 * 1000;

export enum WorkspaceInviteLinkExpireTime {
  OneDay = Day,
  ThreeDays = 3 * Day,
  OneWeek = 7 * Day,
  OneMonth = 30 * Day,
}

registerEnumType(WorkspaceInviteLinkExpireTime, {
  name: 'WorkspaceInviteLinkExpireTime',
  description: 'Workspace invite link expire time',
});
