import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export interface HttpMetrics {
  registry: Registry;
  requestsTotal: Counter<string>;
  requestDuration: Histogram<string>;
  syncLagMs: Gauge<string>;
  updateSizeBytes: Histogram<string>;
  errorRate: Gauge<string>;
}

export function createMetrics(
  serviceName: string,
  options: { collectProcessMetrics?: boolean } = {}
): HttpMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });
  if (options.collectProcessMetrics !== false) {
    collectDefaultMetrics({ register: registry });
  }

  const requestsTotal = new Counter({
    name: 'mosaic_http_requests_total',
    help: 'HTTP requests handled by Mosaic Server',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });

  const requestDuration = new Histogram({
    name: 'mosaic_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  // Placeholders for Phase 2 sync. Exposed now so dashboards can bind early.
  const syncLagMs = new Gauge({
    name: 'mosaic_sync_lag_ms',
    help: 'Doc sync lag (push to fanout) in milliseconds',
    registers: [registry],
  });
  syncLagMs.set(0);

  const updateSizeBytes = new Histogram({
    name: 'mosaic_update_size_bytes',
    help: 'Yjs update payload size in bytes',
    buckets: [128, 512, 2048, 8192, 32768, 131072, 524288],
    registers: [registry],
  });

  const errorRate = new Gauge({
    name: 'mosaic_error_rate',
    help: 'Recent error rate (0–1). Phase 0 always 0.',
    registers: [registry],
  });
  errorRate.set(0);

  return {
    registry,
    requestsTotal,
    requestDuration,
    syncLagMs,
    updateSizeBytes,
    errorRate,
  };
}
