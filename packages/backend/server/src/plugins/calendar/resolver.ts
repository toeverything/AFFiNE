import {
  Args,
  GraphQLISODateTime,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { ActionForbidden, AuthenticationRequired } from '../../base';
import { CurrentUser } from '../../core/auth';
import { ServerConfigType } from '../../core/config/types';
import { AccessController } from '../../core/permission';
import { UserType } from '../../core/user';
import { WorkspaceType } from '../../core/workspaces';
import { Models } from '../../models';
import { CalendarOAuthService } from './oauth';
import { CalendarProviderFactory, CalendarProviderName } from './providers';
import { CalendarService } from './service';
import {
  CalendarAccountObjectType,
  CalendarEventObjectType,
  CalendarSubscriptionObjectType,
  LinkCalendarAccountInput,
  UpdateWorkspaceCalendarsInput,
  WorkspaceCalendarObjectType,
} from './types';

@Resolver(() => ServerConfigType)
export class CalendarServerConfigResolver {
  constructor(private readonly providerFactory: CalendarProviderFactory) {}

  @ResolveField(() => [CalendarProviderName])
  calendarProviders() {
    return this.providerFactory.providers;
  }
}

@Resolver(() => UserType)
export class UserCalendarResolver {
  constructor(private readonly calendar: CalendarService) {}

  @ResolveField(() => [CalendarAccountObjectType])
  async calendarAccounts(
    @CurrentUser() currentUser: CurrentUser,
    @Parent() user: UserType
  ) {
    if (!currentUser || currentUser.id !== user.id) {
      throw new ActionForbidden();
    }
    return await this.calendar.listAccounts(user.id);
  }
}

@Resolver(() => CalendarAccountObjectType)
export class CalendarAccountResolver {
  constructor(private readonly calendar: CalendarService) {}

  @ResolveField(() => [CalendarSubscriptionObjectType])
  async calendars(
    @CurrentUser() user: CurrentUser,
    @Parent() account: CalendarAccountObjectType
  ) {
    return await this.calendar.listAccountCalendars(user.id, account.id);
  }
}

@Resolver(() => WorkspaceType)
export class WorkspaceCalendarResolver {
  constructor(
    private readonly calendar: CalendarService,
    private readonly access: AccessController
  ) {}

  @ResolveField(() => [WorkspaceCalendarObjectType])
  async calendars(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    await this.access
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Settings.Read');
    return await this.calendar.getWorkspaceCalendars(workspace.id);
  }
}

@Resolver(() => WorkspaceCalendarObjectType)
export class WorkspaceCalendarEventsResolver {
  constructor(
    private readonly calendar: CalendarService,
    private readonly access: AccessController
  ) {}

  @ResolveField(() => [CalendarEventObjectType])
  async events(
    @CurrentUser() user: CurrentUser,
    @Parent() calendar: WorkspaceCalendarObjectType,
    @Args({ name: 'from', type: () => GraphQLISODateTime }) from: Date,
    @Args({ name: 'to', type: () => GraphQLISODateTime }) to: Date
  ) {
    await this.access
      .user(user.id)
      .workspace(calendar.workspaceId)
      .assert('Workspace.Settings.Read');

    return await this.calendar.listWorkspaceEvents({
      workspaceCalendarId: calendar.id,
      from,
      to,
    });
  }
}

@Resolver(() => CalendarAccountObjectType)
export class CalendarMutationResolver {
  constructor(
    private readonly calendar: CalendarService,
    private readonly oauth: CalendarOAuthService,
    private readonly models: Models,
    private readonly access: AccessController
  ) {}

  @Mutation(() => String)
  async linkCalendarAccount(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: LinkCalendarAccountInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const state = await this.oauth.saveOAuthState({
      provider: input.provider,
      userId: user.id,
      redirectUri: input.redirectUri ?? undefined,
    });

    const callbackUrl = this.calendar.getCallbackUrl();
    return this.calendar.getAuthUrl(input.provider, state, callbackUrl);
  }

  @Mutation(() => CalendarAccountObjectType, { nullable: true })
  async updateCalendarAccount(
    @CurrentUser() user: CurrentUser,
    @Args('accountId') accountId: string,
    @Args('refreshIntervalMinutes') refreshIntervalMinutes: number
  ) {
    return await this.calendar.updateAccountRefreshInterval(
      user.id,
      accountId,
      refreshIntervalMinutes
    );
  }

  @Mutation(() => Boolean)
  async unlinkCalendarAccount(
    @CurrentUser() user: CurrentUser,
    @Args('accountId') accountId: string
  ) {
    return await this.calendar.unlinkAccount(user.id, accountId);
  }

  @Mutation(() => WorkspaceCalendarObjectType)
  async updateWorkspaceCalendars(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: UpdateWorkspaceCalendarsInput
  ) {
    await this.access
      .user(user.id)
      .workspace(input.workspaceId)
      .assert('Workspace.Settings.Update');

    const calendar = await this.calendar.updateWorkspaceCalendars({
      workspaceId: input.workspaceId,
      userId: user.id,
      items: input.items,
    });

    const items = await this.models.workspaceCalendar.listItems(calendar.id);
    return {
      ...calendar,
      items,
    };
  }
}
