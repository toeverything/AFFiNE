import { ApolloServerErrorCode } from '@apollo/server/errors';
import {
  ArgumentsHost,
  Catch,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';
import { ThrottlerException } from '@nestjs/throttler';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Response } from 'express';
import { GraphQLError } from 'graphql';
import { HttpError } from 'http-errors';
import { of } from 'rxjs';
import { Socket } from 'socket.io';
import { ZodError } from 'zod';

import {
  GraphqlBadRequest,
  HttpRequestError,
  InternalServerError,
  NotFound,
  TooManyRequest,
  UserFriendlyError,
  ValidationError,
} from '../error';
import { metrics } from '../metrics';
import { getRequestIdFromHost } from '../utils';

export function isGraphQLBadRequest(error: GraphQLError) {
  // https://www.apollographql.com/docs/apollo-server/data/errors
  const code = error.extensions?.code;
  return (
    code === ApolloServerErrorCode.GRAPHQL_PARSE_FAILED ||
    code === ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED ||
    code === ApolloServerErrorCode.BAD_USER_INPUT ||
    code === ApolloServerErrorCode.BAD_REQUEST
  );
}

export function mapAnyError(error: any): UserFriendlyError {
  if (error instanceof GraphQLError) {
    if (isGraphQLBadRequest(error)) {
      return new GraphqlBadRequest({
        code: error.extensions.code as string,
        message: error.message,
      });
    }
    error = error.originalError ?? error;
  }
  if (error instanceof UserFriendlyError) {
    return error;
  } else if (error instanceof ThrottlerException) {
    return new TooManyRequest();
  } else if (error instanceof NotFoundException) {
    return new NotFound();
  } else if (error instanceof ZodError) {
    return new ValidationError({
      errors: error.message,
    });
  } else if (
    error instanceof HttpError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    const e = new HttpRequestError({
      message: error.message,
    });
    e.status = error.status;
    return e;
  } else {
    const e = new InternalServerError();
    e.cause = error;
    return e;
  }
}

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  logger = new Logger('GlobalExceptionFilter');
  override catch(exception: Error, host: ArgumentsHost) {
    const error = mapAnyError(exception);
    // with useGlobalFilters, the context is always HTTP
    if (host.getType<GqlContextType>() === 'graphql') {
      // let Graphql LoggerPlugin handle it
      // see '../graphql/logger-plugin.ts'
      throw error;
    } else {
      error.log('HTTP', {
        requestId: error.requestId ?? getRequestIdFromHost(host),
      });
      metrics.controllers
        .counter('error')
        .add(1, { status: error.status, type: error.type, error: error.name });
      const res = host.switchToHttp().getResponse<Response>();
      const respondText = res.getHeader('content-type') === 'text/plain';

      if (respondText) {
        res
          .setHeader('content-type', 'text/plain')
          .status(error.status)
          .send(error.toText());
      } else {
        res.status(error.status).send(error.toJSON());
      }
      return;
    }
  }
}

export class GlobalWsExceptionFilter extends BaseWsExceptionFilter {
  // @ts-expect-error satisfies the override
  override handleError(client: Socket, exception: any): void {
    const error = mapAnyError(exception);
    error.log('Websocket');
    metrics.socketio
      .counter('unhandled_error')
      .add(1, { status: error.status });
    client.emit('error', {
      error: toWebsocketError(error),
    });
  }
}

/**
 * Only exists for websocket error body backward compatibility
 *
 * relay on `code` field instead of `name`
 *
 * @TODO(@forehalo): remove
 */
function toWebsocketError(error: UserFriendlyError) {
  // should be `error.toJSON()` after backward compatibility removed
  return {
    status: error.status,
    code: error.name.toUpperCase(),
    type: error.type.toUpperCase(),
    name: error.name.toUpperCase(),
    message: error.message,
    data: error.data,
    requestId: error.requestId,
  };
}

export const GatewayErrorWrapper = (event: string): MethodDecorator => {
  // @ts-expect-error allow
  return (
    _target,
    _key,
    desc: TypedPropertyDescriptor<(...args: any[]) => any>
  ) => {
    const originalMethod = desc.value;
    if (!originalMethod) {
      return desc;
    }

    desc.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const mappedError = mapAnyError(error);
        mappedError.log('Websocket');
        metrics.socketio
          .counter('error')
          .add(1, { event, status: mappedError.status });

        return {
          error: toWebsocketError(mappedError),
        };
      }
    };

    return desc;
  };
};

export function mapSseError(originalError: any, info: object) {
  const error = mapAnyError(originalError);
  error.log('Sse', info);
  metrics.sse.counter('error').add(1, { status: error.status });
  return of({
    type: 'error' as const,
    data: error.toJSON(),
  });
}
