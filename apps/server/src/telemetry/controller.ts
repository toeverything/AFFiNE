import { Body, Controller, Post } from '@nestjs/common';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import { GCPTraceExporter } from '../index';

@Controller()
export class TelemetryController {
  @Post('/telemetry')
  async index(@Body() spans: string) {
    const readableSpans = this._deserializeReadableSpan(spans);
    await GCPTraceExporter.export(readableSpans, () => {});
  }

  private _deserializeReadableSpan(_spans: string): ReadableSpan[] {
    return [];
  }
}
