import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import './fastify-types.js';
import type { HttpMetrics } from '../observability/metrics.js';
import {
  resolveRequestIds,
  runWithRequestContext,
} from '../observability/request-context.js';
import type { TracingSkeleton } from '../observability/tracing.js';

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function routeLabel(url: string): string {
  if (url.startsWith('/socket.io')) {
    return '/socket.io';
  }
  const path = url.split('?')[0] ?? url;
  return path;
}

const observability: FastifyPluginAsync<{
  metrics: HttpMetrics;
  tracing: TracingSkeleton;
}> = async (app, opts) => {
  app.addHook('onRequest', (request, reply, done) => {
    const ids = resolveRequestIds({
      requestId: headerValue(request.headers['x-request-id']),
      traceId: headerValue(request.headers['x-trace-id']),
      traceparent: headerValue(request.headers.traceparent),
    });
    request.requestId = ids.requestId;
    request.traceId = ids.traceId;
    reply.header('x-request-id', ids.requestId);
    reply.header('x-trace-id', ids.traceId);

    runWithRequestContext(ids, () => {
      const span = opts.tracing.startSpan(
        `${request.method} ${routeLabel(request.url)}`
      );
      request.traceSpan = span;
      done();
    });
  });

  app.addHook('onResponse', (request, reply, done) => {
    const ids = { requestId: request.requestId, traceId: request.traceId };
    runWithRequestContext(ids, () => {
      const route = routeLabel(request.routeOptions?.url ?? request.url);
      const status = String(reply.statusCode);
      opts.metrics.requestsTotal.inc({ method: request.method, route, status });
      const seconds = reply.elapsedTime / 1000;
      opts.metrics.requestDuration.observe(
        { method: request.method, route, status },
        seconds
      );
      if (request.traceSpan) {
        opts.tracing.endSpan(request.traceSpan, {
          status,
          method: request.method,
          route,
        });
      }
      done();
    });
  });
};

/** Break encapsulation so request/trace hooks apply to every route. */
export const observabilityPlugin = fp(observability, {
  name: 'mosaic-observability',
  fastify: '5.x',
});
