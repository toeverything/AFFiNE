import { Body, Controller, Post } from '@nestjs/common';

import { Throttle } from '../../base';
import { CurrentUser, type CurrentUser as CurrentUserType } from '../auth';
import { MobileDebugLogService } from './service';
import type { MobileDebugLogAck, MobileDebugLogBatch } from './types';

// Deliberately no @Public() decorator here, and @CurrentUser() below is
// required (non-optional): the existing global AuthGuard rejects any
// request without a valid session (401) before this handler ever runs.
@Throttle('strict')
@Controller('/api/mobile-debug-log')
export class MobileDebugLogController {
  constructor(private readonly service: MobileDebugLogService) {}

  @Post('/collect')
  collect(
    @Body() batch: MobileDebugLogBatch,
    @CurrentUser() user: CurrentUserType
  ): MobileDebugLogAck {
    return this.service.ingest(batch, user.id);
  }
}
