import fp from 'fastify-plugin';

import type { HealthService } from '../../application/health-service.js';

export const healthRoutes = fp<{ health: HealthService }>(
  async (app, opts) => {
    app.get('/health/live', async () => opts.health.liveness());

    app.get('/health/ready', async (_request, reply) => {
      const body = await opts.health.readiness();
      if (body.status === 'error') {
        return reply.code(503).send(body);
      }
      return body;
    });
  },
  { name: 'mosaic-health' }
);
