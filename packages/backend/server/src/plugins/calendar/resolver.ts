import {
  Args,
  GraphQLISODateTime,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';

import { AuthenticationRequired } from '../../base';
import { CurrentUser } from '../../core/auth';
import { AccessController } from '../../core/permission';
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

@Resolver(() => CalendarAccountObjectType)
export class CalendarResolver {
  constructor(
    private readonly calendar: CalendarService,
    private readonly oauth: CalendarOAuthService,
    private readonly models: Models,
    private readonly access: AccessController,
    private readonly providerFactory: CalendarProviderFactory
  ) {}

  @Query(() => [CalendarAccountObjectType])
  async calendarAccounts(@CurrentUser() user: CurrentUser) {
    return await this.calendar.listAccounts(user.id);
  }

  @Query(() => [CalendarSubscriptionObjectType])
  async calendarAccountCalendars(
    @CurrentUser() user: CurrentUser,
    @Args('accountId') accountId: string
  ) {
    return await this.calendar.listAccountCalendars(user.id, accountId);
  }

  @Query(() => [WorkspaceCalendarObjectType])
  async workspaceCalendars(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.access
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.CreateDoc');
    return await this.calendar.getWorkspaceCalendars(workspaceId);
  }

  @Query(() => [CalendarEventObjectType])
  async calendarEvents(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceCalendarId') workspaceCalendarId: string,
    @Args({ name: 'from', type: () => GraphQLISODateTime }) from: Date,
    @Args({ name: 'to', type: () => GraphQLISODateTime }) to: Date
  ) {
    const workspaceCalendar =
      await this.models.workspaceCalendar.get(workspaceCalendarId);
    if (!workspaceCalendar) {
      return [];
    }

    await this.access
      .user(user.id)
      .workspace(workspaceCalendar.workspaceId)
      .assert('Workspace.CreateDoc');

    return await this.calendar.listWorkspaceEvents({
      workspaceCalendarId,
      from,
      to,
    });
  }

  @Query(() => [CalendarProviderName])
  async calendarProviders() {
    return this.providerFactory.providers;
  }

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
