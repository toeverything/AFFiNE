import {
  type CalendarAccountCalendarsQuery,
  calendarAccountCalendarsQuery,
  type CalendarAccountsQuery,
  calendarAccountsQuery,
  type CalendarEventsQuery,
  calendarEventsQuery,
  type UpdateWorkspaceCalendarsMutation,
  updateWorkspaceCalendarsMutation,
  type WorkspaceCalendarItemInput,
  type WorkspaceCalendarsQuery,
  workspaceCalendarsQuery,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';
import type { WorkspaceService } from '../../workspace';

export class CalendarStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  private get gql() {
    return this.workspaceServerService.server?.gql;
  }

  private get workspaceId() {
    return this.workspaceService.workspace.id;
  }

  async fetchAccounts(signal?: AbortSignal) {
    const gql = this.gql;
    if (!gql) return [] satisfies CalendarAccountsQuery['calendarAccounts'];
    const data = await gql({
      query: calendarAccountsQuery,
      context: { signal },
    });
    return data.calendarAccounts;
  }

  async fetchAccountCalendars(accountId: string, signal?: AbortSignal) {
    const gql = this.gql;
    if (!gql) {
      return [] satisfies CalendarAccountCalendarsQuery['calendarAccountCalendars'];
    }
    const data = await gql({
      query: calendarAccountCalendarsQuery,
      variables: { accountId },
      context: { signal },
    });
    return data.calendarAccountCalendars;
  }

  async fetchWorkspaceCalendars(signal?: AbortSignal) {
    const gql = this.gql;
    if (!gql) {
      return [] satisfies WorkspaceCalendarsQuery['workspaceCalendars'];
    }
    const data = await gql({
      query: workspaceCalendarsQuery,
      variables: { workspaceId: this.workspaceId },
      context: { signal },
    });
    return data.workspaceCalendars;
  }

  async updateWorkspaceCalendars(items: WorkspaceCalendarItemInput[]) {
    const gql = this.gql;
    if (!gql) {
      throw new Error('No graphql service available');
    }
    const data = await gql({
      query: updateWorkspaceCalendarsMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          items,
        },
      },
    });
    return data.updateWorkspaceCalendars satisfies UpdateWorkspaceCalendarsMutation['updateWorkspaceCalendars'];
  }

  async fetchEvents(
    workspaceCalendarId: string,
    from: string,
    to: string,
    signal?: AbortSignal
  ) {
    const gql = this.gql;
    if (!gql) return [] satisfies CalendarEventsQuery['calendarEvents'];
    const data = await gql({
      query: calendarEventsQuery,
      variables: {
        workspaceCalendarId,
        from,
        to,
      },
      context: { signal },
    });
    return data.calendarEvents;
  }
}
