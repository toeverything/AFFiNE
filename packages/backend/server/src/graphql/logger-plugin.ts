import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import { Response } from 'express';

import { metrics } from '../metrics/metrics';
import { ReqContext } from '../types';

@Plugin()
export class GQLLoggerPlugin implements ApolloServerPlugin {
  protected logger = new Logger(GQLLoggerPlugin.name);

  requestDidStart(
    reqContext: GraphQLRequestContext<ReqContext>
  ): Promise<GraphQLRequestListener<GraphQLRequestContext<ReqContext>>> {
    const res = reqContext.contextValue.req.res as Response;
    const operation = reqContext.request.operationName;

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
