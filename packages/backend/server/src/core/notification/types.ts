import {
  createUnionType,
  Field,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

import { Paginated } from '../../base';
import {
  DocMode,
  InvitationNotificationBody,
  MentionDoc,
  MentionDocCreate,
  Notification,
  NotificationLevel,
  NotificationType,
} from '../../models';
import { WorkspaceDocInfo } from '../doc/reader';
import { PublicUserType } from '../user';

registerEnumType(NotificationLevel, {
  name: 'NotificationLevel',
  description: 'Notification level',
});

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description: 'Notification type',
});

registerEnumType(DocMode, {
  name: 'DocMode',
  description: 'Doc mode',
});

@ObjectType()
export class NotificationWorkspaceType implements WorkspaceDocInfo {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Workspace name' })
  name!: string;

  @Field(() => String, {
    description: 'Workspace avatar url',
    nullable: true,
  })
  avatarUrl?: string;
}

@ObjectType()
export abstract class BaseNotificationBodyType {
  @Field(() => NotificationType, {
    description: 'The type of the notification',
  })
  type!: NotificationType;

  @Field(() => PublicUserType, {
    nullable: true,
    description:
      'The user who created the notification, maybe null when user is deleted or sent by system',
  })
  createdByUser?: PublicUserType;

  @Field(() => NotificationWorkspaceType, {
    nullable: true,
  })
  workspace?: NotificationWorkspaceType;
}

@ObjectType()
export class MentionDocType implements MentionDoc {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => DocMode)
  mode!: DocMode;

  @Field(() => String, {
    nullable: true,
  })
  blockId?: string;

  @Field(() => String, {
    nullable: true,
  })
  elementId?: string;
}

@ObjectType()
export class MentionNotificationBodyType extends BaseNotificationBodyType {
  @Field(() => MentionDocType)
  doc!: MentionDocType;
}

@ObjectType()
export abstract class InvitationBaseNotificationBodyType extends BaseNotificationBodyType {
  @Field(() => ID)
  inviteId!: string;
}

@ObjectType()
export class InvitationNotificationBodyType
  extends InvitationBaseNotificationBodyType
  implements Partial<InvitationNotificationBody> {}

@ObjectType()
export class InvitationAcceptedNotificationBodyType
  extends InvitationBaseNotificationBodyType
  implements Partial<InvitationNotificationBody> {}

@ObjectType()
export class InvitationBlockedNotificationBodyType
  extends InvitationBaseNotificationBodyType
  implements Partial<InvitationNotificationBody> {}

@ObjectType()
export class InvitationReviewRequestNotificationBodyType
  extends InvitationBaseNotificationBodyType
  implements Partial<InvitationNotificationBody> {}

@ObjectType()
export class InvitationReviewApprovedNotificationBodyType
  extends InvitationBaseNotificationBodyType
  implements Partial<InvitationNotificationBody> {}

@ObjectType()
export class InvitationReviewDeclinedNotificationBodyType extends BaseNotificationBodyType {}

export const UnionNotificationBodyType = createUnionType({
  name: 'UnionNotificationBodyType',
  types: () =>
    [
      MentionNotificationBodyType,
      InvitationNotificationBodyType,
      InvitationAcceptedNotificationBodyType,
      InvitationBlockedNotificationBodyType,
      InvitationReviewRequestNotificationBodyType,
      InvitationReviewApprovedNotificationBodyType,
      InvitationReviewDeclinedNotificationBodyType,
    ] as const,
});

@ObjectType()
export class NotificationObjectType implements Partial<Notification> {
  @Field(() => ID)
  id!: string;

  @Field(() => NotificationLevel, {
    description: 'The level of the notification',
  })
  level!: NotificationLevel;

  @Field(() => NotificationType, {
    description: 'The type of the notification',
  })
  type!: NotificationType;

  @Field({ description: 'Whether the notification has been read' })
  read!: boolean;

  @Field({ description: 'The created at time of the notification' })
  createdAt!: Date;

  @Field({ description: 'The updated at time of the notification' })
  updatedAt!: Date;

  @Field(() => GraphQLJSONObject, {
    description:
      'The body of the notification, different types have different fields, see UnionNotificationBodyType',
  })
  body!: object;
}

@ObjectType()
export class PaginatedNotificationObjectType extends Paginated(
  NotificationObjectType
) {}

@InputType()
export class MentionDocInput implements MentionDocCreate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => DocMode)
  mode!: DocMode;

  @Field(() => String, {
    description: 'The block id in the doc',
    nullable: true,
  })
  blockId?: string;

  @Field(() => String, {
    description: 'The element id in the doc',
    nullable: true,
  })
  elementId?: string;
}

@InputType()
export class MentionInput {
  @Field()
  userId!: string;

  @Field()
  workspaceId!: string;

  @Field(() => MentionDocInput)
  doc!: MentionDocInput;
}
