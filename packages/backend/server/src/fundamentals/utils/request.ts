import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { GqlContextType } from '@nestjs/graphql';
import { GqlArgumentsHost, GqlExecutionContext } from '@nestjs/graphql';
import type { Request, Response } from 'express';

export function getRequestResponseFromContext(context: ExecutionContext) {
  switch (context.getType<GqlContextType>()) {
    case 'graphql': {
      const gqlContext = GqlExecutionContext.create(context).getContext<{
        req: Request;
      }>();
      return {
        req: gqlContext.req,
        res: gqlContext.req.res,
      };
    }
    case 'http': {
      const http = context.switchToHttp();
      return {
        req: http.getRequest<Request>(),
        res: http.getResponse<Response>(),
      };
    }
    case 'ws': {
      const ws = context.switchToWs();
      const req = ws.getClient().handshake;

      const cookies = req?.headers?.cookie;
      // patch cookies to match auth guard logic
      if (typeof cookies === 'string') {
        req.cookies = cookies
          .split(';')
          .map(v => v.split('='))
          .reduce(
            (acc, v) => {
              acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(
                v[1].trim()
              );
              return acc;
            },
            {} as Record<string, string>
          );
      }

      return { req };
    }
    default:
      throw new Error('Unknown context type for getting request and response');
  }
}

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
    default:
      throw new Error('Unknown host type for getting request and response');
  }
}

export function getRequestFromHost(host: ArgumentsHost) {
  return getRequestResponseFromHost(host).req;
}
