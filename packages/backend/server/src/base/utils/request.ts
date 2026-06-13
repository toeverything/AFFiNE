import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';

import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { GqlContextType } from '@nestjs/graphql';
import { GqlArgumentsHost } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { ClsServiceManager } from 'nestjs-cls';
import type { Socket } from 'socket.io';
import { z } from 'zod';

type RequestResponse = {
  req: Request;
  res?: Response;
};

const RequestCookieValueSchema = z.string().min(1);
const RequestHeaderValueSchema = z.string().min(1);

export function getRequestResponseFromHost(
  host: ArgumentsHost
): RequestResponse {
  switch (host.getType<GqlContextType>()) {
    case 'graphql': {
      const gqlContext = GqlArgumentsHost.create(host).getContext<{
        req: Request;
      }>();
      return {
        req: gqlContext.req,
        res: gqlContext.req.res,
      };
    }
    case 'http': {
      const http = host.switchToHttp();
      return {
        req: http.getRequest<Request>(),
        res: http.getResponse<Response>(),
      };
    }
    case 'ws': {
      const ws = host.switchToWs();
      const req = ws.getClient<Socket>().request as Request;
      parseCookies(req);
      return { req };
    }
    case 'rpc': {
      const rpc = host.switchToRpc();
      const { req } = rpc.getContext<{ req: Request }>();

      return {
        req,
        res: req.res,
      };
    }
  }
}

export function getRequestFromHost(host: ArgumentsHost): Request {
  return getRequestResponseFromHost(host).req;
}

export function getRequestResponseFromContext(
  ctx: ExecutionContext
): RequestResponse {
  return getRequestResponseFromHost(ctx);
}

/**
 * simple patch for request not protected by `cookie-parser`
 * only take effect if `req.cookies` is not defined
 */
export function parseCookies(
  req: IncomingMessage & { cookies?: Record<string, string> }
) {
  if (req.cookies) return;

  const cookieStr = req.headers.cookie ?? '';
  req.cookies = cookieStr.split(';').reduce(
    (cookies, cookie) => {
      const [key, val] = cookie.split('=');

      if (key) {
        const rawKey = key.trim();
        const rawVal = val ? val.trim() : val;

        let safeKey = rawKey;
        let safeVal = rawVal;

        try {
          safeKey = decodeURIComponent(rawKey);
        } catch {}

        if (rawVal) {
          try {
            safeVal = decodeURIComponent(rawVal);
          } catch {}
        }

        cookies[safeKey] = safeVal;
      }

      return cookies;
    },
    {} as Record<string, string>
  );
}

export function getRequestCookie(
  req: IncomingMessage & { cookies?: Record<string, unknown> },
  name: string
) {
  parseCookies(req as IncomingMessage & { cookies?: Record<string, string> });

  const value = req.cookies?.[name];

  const parsed = RequestCookieValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function getRequestHeader(req: IncomingMessage, name: string) {
  const value = req.headers[name.toLowerCase()];

  const parsed = RequestHeaderValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Request type
 *
 * @description
 * - `graphql`: graphql request
 * - `http`: http request
 * - `ws`: websocket request
 * - `event`: event
 * - `job`: cron job
 * - `rpc`: rpc request
 */
export type RequestType = GqlContextType | 'event' | 'job';

export function genRequestId(type: RequestType) {
  return `${env.DEPLOYMENT_TYPE}:${type}:${randomUUID()}`;
}

export function getOrGenRequestId(type: RequestType) {
  // The request id must exist in a cls context,
  // but it can be lost in unexpected scenarios, such as unit tests, where it is automatically generated.
  return ClsServiceManager.getClsService()?.getId() ?? genRequestId(type);
}

export function getRequestIdFromRequest(req: Request, type: RequestType) {
  const traceContext = req.headers['x-cloud-trace-context'] as string;
  const traceId = traceContext ? traceContext.split('/', 1)[0] : undefined;
  if (traceId) return traceId;
  return genRequestId(type);
}

export function getRequestIdFromHost(host: ArgumentsHost) {
  const type = host.getType<GqlContextType>();
  if (type === 'ws') {
    return genRequestId(type);
  }
  const req = getRequestFromHost(host);
  return getRequestIdFromRequest(req, type);
}

export function getClientVersionFromRequest(req: Request) {
  let version = req.headers['x-affine-version'];
  if (Array.isArray(version)) {
    version = version[0];
  }
  return version;
}
