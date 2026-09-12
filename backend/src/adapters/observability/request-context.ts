import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  traceId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i;

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return storage.run(context, fn);
}

export function resolveRequestIds(headers: {
  requestId?: string | undefined;
  traceId?: string | undefined;
  traceparent?: string | undefined;
}): RequestContext {
  const fromTraceparent = headers.traceparent?.match(TRACEPARENT)?.[1];
  const requestId = headers.requestId?.trim() || randomUUID();
  const traceId = headers.traceId?.trim() || fromTraceparent || requestId;
  return { requestId, traceId };
}
