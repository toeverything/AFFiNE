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
import type { Workspace } from '@prisma/client';
import { SafeIntResolver } from 'graphql-scalars';

import { UserType } from '../user/types';

export enum Permission {
  Read = 0,
  Write = 1,
  Admin = 10,
  Owner = 99,
}

registerEnumType(Permission, {
  name: 'Permission',
  description: 'User permission in workspace',
});

@ObjectType()
export class InviteUserType extends OmitType(
  PartialType(UserType),
  ['id'],
  ObjectType
) {
  @Field(() => ID)
  id!: string;

  @Field(() => Permission, { description: 'User permission in workspace' })
  permission!: Permission;

  @Field({ description: 'Invite id' })
  inviteId!: string;

  @Field({ description: 'User accepted' })
  accepted!: boolean;
}

@ObjectType()
export class WorkspaceType implements Partial<Workspace> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'is Public workspace' })
  public!: boolean;

  @Field({ description: 'Workspace created date' })
  createdAt!: Date;

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
  user!: UserType;
  @Field({ description: 'Invitee information' })
  invitee!: UserType;
}

@InputType()
export class UpdateWorkspaceInput extends PickType(
  PartialType(WorkspaceType),
  ['public'],
  InputType
) {
  @Field(() => ID)
  id!: string;
}
