import {
  Field,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

import { CalendarProviderName } from './providers';

registerEnumType(CalendarProviderName, { name: 'CalendarProviderType' });

@ObjectType()
export class CalendarAccountObjectType {
  @Field()
  id!: string;

  @Field(() => CalendarProviderName)
  provider!: CalendarProviderName;

  @Field()
  providerAccountId!: string;

  @Field(() => String, { nullable: true })
  displayName?: string | null;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  lastError?: string | null;

  @Field(() => Int)
  refreshIntervalMinutes!: number;

  @Field(() => Int)
  calendarsCount!: number;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class CalendarSubscriptionObjectType {
  @Field()
  id!: string;

  @Field()
  accountId!: string;

  @Field(() => CalendarProviderName)
  provider!: CalendarProviderName;

  @Field()
  externalCalendarId!: string;

  @Field(() => String, { nullable: true })
  displayName?: string | null;

  @Field(() => String, { nullable: true })
  timezone?: string | null;

  @Field(() => String, { nullable: true })
  color?: string | null;

  @Field()
  enabled!: boolean;

  @Field(() => Date, { nullable: true })
  lastSyncAt?: Date | null;
}

@ObjectType()
export class WorkspaceCalendarItemObjectType {
  @Field()
  id!: string;

  @Field()
  subscriptionId!: string;

  @Field(() => Int, { nullable: true })
  sortOrder?: number | null;

  @Field(() => String, { nullable: true })
  colorOverride?: string | null;

  @Field()
  enabled!: boolean;
}

@ObjectType()
export class WorkspaceCalendarObjectType {
  @Field()
  id!: string;

  @Field()
  workspaceId!: string;

  @Field()
  createdByUserId!: string;

  @Field(() => String, { nullable: true })
  displayNameOverride?: string | null;

  @Field(() => String, { nullable: true })
  colorOverride?: string | null;

  @Field()
  enabled!: boolean;

  @Field(() => [WorkspaceCalendarItemObjectType])
  items!: WorkspaceCalendarItemObjectType[];
}

@ObjectType()
export class CalendarEventObjectType {
  @Field()
  id!: string;

  @Field()
  subscriptionId!: string;

  @Field()
  externalEventId!: string;

  @Field(() => String, { nullable: true })
  recurrenceId?: string | null;

  @Field(() => String, { nullable: true })
  status?: string | null;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  location?: string | null;

  @Field()
  startAtUtc!: Date;

  @Field()
  endAtUtc!: Date;

  @Field(() => String, { nullable: true })
  originalTimezone?: string | null;

  @Field()
  allDay!: boolean;
}

@InputType()
export class WorkspaceCalendarItemInput {
  @Field()
  subscriptionId!: string;

  @Field(() => Int, { nullable: true })
  sortOrder?: number | null;

  @Field(() => String, { nullable: true })
  colorOverride?: string | null;
}

@InputType()
export class UpdateWorkspaceCalendarsInput {
  @Field()
  workspaceId!: string;

  @Field(() => [WorkspaceCalendarItemInput])
  items!: WorkspaceCalendarItemInput[];
}

@InputType()
export class LinkCalendarAccountInput {
  @Field(() => CalendarProviderName)
  provider!: CalendarProviderName;

  @Field(() => String, { nullable: true })
  redirectUri?: string | null;
}
