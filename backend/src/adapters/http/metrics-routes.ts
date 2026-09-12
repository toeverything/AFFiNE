import fp from 'fastify-plugin';

import type { HttpMetrics } from '../observability/metrics.js';

export const metricsRoutes = fp<{ metrics: HttpMetrics }>(
  async (app, opts) => {
    app.get('/metrics', async (_request, reply) => {
      reply.header('content-type', opts.metrics.registry.contentType);
      return opts.metrics.registry.metrics();
    });
  },
  { name: 'mosaic-metrics' }
);
