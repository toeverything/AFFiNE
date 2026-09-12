import fp from 'fastify-plugin';

import type { HealthService } from '../../application/health-service.js';

export const infoRoutes = fp<{ health: HealthService }>(
  async (app, opts) => {
    app.get('/info', async () => opts.health.getServerInfo());
  },
  { name: 'mosaic-info' }
);
