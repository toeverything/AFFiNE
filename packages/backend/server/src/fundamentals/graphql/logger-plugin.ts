import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
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
  requestDidStart(
    ctx: GraphQLRequestContext<RequestContext>
  ): Promise<GraphQLRequestListener<GraphQLRequestContext<RequestContext>>> {
    const res = ctx.contextValue.req.res as Response;
    const operation = ctx.request.operationName;

    metrics.gql.counter('query_counter').add(1, { operation });
    const start = Date.now();
    function endTimer() {
      return Date.now() - start;
    }

    return Promise.resolve({
      willSendResponse: () => {
        const time = endTimer();
        res.setHeader('Server-Timing', `gql;dur=${time};desc="GraphQL"`);
        metrics.gql.histogram('query_duration').record(time, { operation });
        return Promise.resolve();
      },
      didEncounterErrors: ctx => {
        ctx.errors.forEach(gqlErr => {
          const error = mapAnyError(
            gqlErr.originalError ? gqlErr.originalError : gqlErr
          );
          error.log('GraphQL');

          metrics.gql
            .counter('query_error_counter')
            .add(1, { operation, code: error.status });
        });

        return Promise.resolve();
      },
    });
  }
}
