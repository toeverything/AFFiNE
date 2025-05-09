import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import { Response } from 'express';

import { metrics } from '../metrics/metrics';
import { mapAnyError } from '../nestjs';

export interface RequestContext {
  req: Express.Request & {
    res: Express.Response;
  };
}

@Plugin()
export class GQLLoggerPlugin implements ApolloServerPlugin {
  private readonly logger = new Logger(GQLLoggerPlugin.name);

  requestDidStart(
    ctx: GraphQLRequestContext<RequestContext>
  ): Promise<GraphQLRequestListener<GraphQLRequestContext<RequestContext>>> {
    const res = ctx.contextValue.req.res as Response;
    const headers = ctx.request.http?.headers;

    const info = {
      operation: ctx.request.operationName ?? headers?.get('x-operation-name'),
      clientVersion: headers?.get('x-affine-version'),
    };

    if (!info.operation) {
      this.logger.warn(
        `GraphQL operation name is not provided (${JSON.stringify({
          userAgent: headers?.get('user-agent'),
          clientVersion: info.clientVersion,
          rayId: headers?.get('cf-ray'),
          country: headers?.get('cf-ipcountry'),
        })})`
      );
    }

    metrics.gql.counter('query_counter').add(1, info);
    const start = Date.now();
    function endTimer() {
      return Date.now() - start;
    }

    return Promise.resolve({
      willSendResponse: () => {
        const time = endTimer();
        res.setHeader('Server-Timing', `gql;dur=${time};desc="GraphQL"`);
        metrics.gql.histogram('query_duration').record(time, info);
        return Promise.resolve();
      },
      didEncounterErrors: ctx => {
        ctx.errors.forEach(gqlErr => {
          const error = mapAnyError(gqlErr);
          error.log('GraphQL');

          metrics.gql.counter('query_error_counter').add(1, {
            ...info,
            code: error.status,
            type: error.type,
            error: error.name,
          });
        });

        return Promise.resolve();
      },
    });
  }
}
