import { getRequestContext } from './request-context.js';

export interface TraceSpan {
  name: string;
  traceId: string;
  startedAt: number;
}

/**
 * In-process tracing skeleton.
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set, spans are logged for export wiring.
 * Full OTLP SDK is deferred until GraphQL + Socket.IO exist (Phase 1–2).
 */
export class TracingSkeleton {
  constructor(
    private readonly serviceName: string,
    private readonly otlpEndpoint: string | undefined,
    private readonly log: (
      payload: Record<string, unknown>,
      msg: string
    ) => void
  ) {}

  startSpan(name: string): TraceSpan {
    const ctx = getRequestContext();
    return {
      name,
      traceId: ctx?.traceId ?? 'untraced',
      startedAt: Date.now(),
    };
  }

  endSpan(span: TraceSpan, extra?: Record<string, unknown>): void {
    const durationMs = Date.now() - span.startedAt;
    if (!this.otlpEndpoint) {
      return;
    }
    this.log(
      {
        service: this.serviceName,
        span: span.name,
        traceId: span.traceId,
        durationMs,
        exporter: this.otlpEndpoint,
        ...extra,
      },
      'span'
    );
  }
}
