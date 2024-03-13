import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { GqlContextType } from '@nestjs/graphql';
import { GqlArgumentsHost } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';

export function getRequestResponseFromHost(host: ArgumentsHost) {
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
      const req = ws.getClient<Socket>().client.conn.request as Request;

      const cookieStr = req?.headers?.cookie;
      // patch cookies to match auth guard logic
      if (typeof cookieStr === 'string') {
        req.cookies = cookieStr.split(';').reduce(
          (cookies, cookie) => {
            const [key, val] = cookie.split('=');

            if (key) {
              cookies[decodeURIComponent(key.trim())] = val
                ? decodeURIComponent(val.trim())
                : val;
            }

            return cookies;
          },
          {} as Record<string, string>
        );
      }

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

export function getRequestFromHost(host: ArgumentsHost) {
  return getRequestResponseFromHost(host).req;
}

export function getRequestResponseFromContext(ctx: ExecutionContext) {
  return getRequestResponseFromHost(ctx);
}
