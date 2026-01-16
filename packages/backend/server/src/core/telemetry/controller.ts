import { Body, Controller, Options, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { BadRequest, Throttle, UseNamedGuard } from '../../base';
import type { CurrentUser as CurrentUserType } from '../auth';
import { Public } from '../auth';
import { CurrentUser } from '../auth';
import { TelemetryService } from './service';
import { TelemetryAck, type TelemetryBatch } from './types';

@Public()
@UseNamedGuard('version')
@Throttle('default')
@Controller('/api/telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Options('/collect')
  collectOptions(@Req() req: Request, @Res() res: Response) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!this.telemetry.isOriginAllowed(origin, referer)) {
      throw new BadRequest(`Invalid origin: ${origin}, referer: ${referer}`);
    }

    return res
      .status(200)
      .header({
        ...this.telemetry.getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-affine-version',
      })
      .send();
  }

  @Post('/collect')
  async collect(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() batch: TelemetryBatch,
    @CurrentUser() user?: CurrentUserType
  ): Promise<TelemetryAck> {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!this.telemetry.isOriginAllowed(origin, referer)) {
      throw new BadRequest('Invalid origin: ' + origin);
    }

    res.header({
      ...this.telemetry.getCorsHeaders(origin),
    });

    const patchedBatch =
      user && Array.isArray(batch?.events)
        ? {
            ...batch,
            events: batch.events.map(event => ({
              ...event,
              userId: event.userId ?? user.id,
            })),
          }
        : batch;

    return this.telemetry.collectBatch(patchedBatch);
  }
}
