import { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import {
  GqlArgumentsHost,
  GqlContextType,
  GqlExecutionContext,
} from '@nestjs/graphql';
import { Request, Response } from 'express';

export function getRequestResponseFromContext(context: ExecutionContext) {
  switch (context.getType<GqlContextType>()) {
    case 'graphql': {
      const gqlContext = GqlExecutionContext.create(context).getContext<{
        req: Request;
      }>();
      return {
        req: gqlContext.req,
        res: gqlContext.req.res!,
      };
    }
    case 'http': {
      const http = context.switchToHttp();
      return {
        req: http.getRequest<Request>(),
        res: http.getResponse<Response>(),
      };
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
        res: gqlContext.req.res!,
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
