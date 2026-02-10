import './config';

import { Module } from '@nestjs/common';

import { AuthModule } from '../../core/auth';
import { PermissionModule } from '../../core/permission';
import { WorkspaceModule } from '../../core/workspaces';
import { CalendarController } from './controller';
import { CalendarCronJobs } from './cron';
import { CalendarOAuthService } from './oauth';
import { CalendarProviderFactory, CalendarProviders } from './providers';
import {
  CalendarAccountResolver,
  CalendarMutationResolver,
  CalendarServerConfigResolver,
  UserCalendarResolver,
  WorkspaceCalendarEventsResolver,
  WorkspaceCalendarResolver,
} from './resolver';
import { CalendarService } from './service';

@Module({
  imports: [AuthModule, PermissionModule, WorkspaceModule],
  providers: [
    ...CalendarProviders,
    CalendarProviderFactory,
    CalendarService,
    CalendarOAuthService,
    CalendarCronJobs,
    CalendarServerConfigResolver,
    UserCalendarResolver,
    CalendarAccountResolver,
    WorkspaceCalendarResolver,
    WorkspaceCalendarEventsResolver,
    CalendarMutationResolver,
  ],
  controllers: [CalendarController],
})
export class CalendarModule {}
