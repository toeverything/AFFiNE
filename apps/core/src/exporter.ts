import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

export class CustomSpanExporter implements SpanExporter {
  constructor(private endpoint: string) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this._sendSpans(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    this._sendSpans([]);
    return this.forceFlush();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  _serializeReadableSpans(_spans: ReadableSpan[]): string {
    return '';
  }

  private async _sendSpans(
    spans: ReadableSpan[],
    done?: (result: ExportResult) => void
  ): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: this._serializeReadableSpans(spans),
    });

    if (done && response.status === 200) {
      return done({ code: ExportResultCode.SUCCESS });
    }
  }
}
