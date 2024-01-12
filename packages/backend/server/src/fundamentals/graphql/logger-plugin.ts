import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import { Response } from 'express';

import { metrics } from '../metrics/metrics';

export interface RequestContext {
  req: Express.Request & {
    res: Express.Response;
  };
}

@Plugin()
export class GQLLoggerPlugin implements ApolloServerPlugin {
  protected logger = new Logger(GQLLoggerPlugin.name);

  requestDidStart(
    ctx: GraphQLRequestContext<RequestContext>
  ): Promise<GraphQLRequestListener<GraphQLRequestContext<RequestContext>>> {
    const res = ctx.contextValue.req.res as Response;
    const operation = ctx.request.operationName;

    metrics.gql.counter('query_counter').add(1, { operation });
    const start = Date.now();

    return Promise.resolve({
      willSendResponse: () => {
        const costInMilliseconds = Date.now() - start;
        res.setHeader(
          'Server-Timing',
          `gql;dur=${costInMilliseconds};desc="GraphQL"`
        );
        metrics.gql
          .histogram('query_duration')
          .record(costInMilliseconds, { operation });
        return Promise.resolve();
      },
      didEncounterErrors: () => {
        const costInMilliseconds = Date.now() - start;
        res.setHeader(
          'Server-Timing',
          `gql;dur=${costInMilliseconds};desc="GraphQL ${operation}"`
        );
        metrics.gql
          .histogram('query_duration')
          .record(costInMilliseconds, { operation });
        return Promise.resolve();
      },
    });
  }
}
