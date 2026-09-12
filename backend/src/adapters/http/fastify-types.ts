import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Session } from '../../domain/identity.js';
import type { TraceSpan } from '../observability/tracing.js';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    traceId: string;
    traceSpan?: TraceSpan;
    authSession: Session | null;
  }
}

export type { FastifyReply, FastifyRequest };
