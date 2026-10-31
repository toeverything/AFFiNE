import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';

import { Public } from '../auth';
import { MobileDebugEvalService } from './service';

// All four routes are @Public(): this is a throwaway, disabled-by-default
// debug tool (see module doc comment), not a real feature, so the ONLY
// gate that matters is `mobileDebugEval.enabled` (service.assertEnabled()
// on every method). submit/result-by-id are ALSO gated by the x-debug-eval-token
// shared secret, since those are the actual attack surface (anyone who knows
// the secret can run arbitrary JS in the live PWA session) -- pending/result
// deliberately do NOT require a real user session: this dev instance isn't
// always signed in as a full account, and there's nothing worth protecting
// on the client-poll side on its own (no secret, no ability to submit).
//
// Deliberately no @Throttle(): the client polls /pending every 2s by
// design, and 'strict' (20/60s) throttles that out almost immediately --
// confirmed live (429 after a handful of polls). This is disabled by
// default and never meant to see real traffic, so skip the limiter rather
// than tune it.
@Controller('/api/mobile-debug-eval')
export class MobileDebugEvalController {
  constructor(private readonly service: MobileDebugEvalService) {}

  @Public()
  @Post('/submit')
  submit(
    @Body('code') code: string,
    @Headers('x-debug-eval-token') token: string | undefined
  ) {
    return this.service.submit(code, token);
  }

  @Public()
  @Get('/result/:id')
  getResult(
    @Param('id') id: string,
    @Headers('x-debug-eval-token') token: string | undefined
  ) {
    return this.service.getResult(id, token);
  }

  @Public()
  @Get('/pending')
  pending() {
    return this.service.consumePending();
  }

  @Public()
  @Post('/result')
  reportResult(
    @Body('id') id: string,
    @Body('ok') ok: boolean,
    @Body('result') result: string | undefined,
    @Body('error') error: string | undefined
  ) {
    return this.service.reportResult(id, ok, result, error);
  }
}
