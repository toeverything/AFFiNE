import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import { Response } from 'express';

import { OPERATION_NAME, REQUEST_ID } from '../constants';
import { Metrics } from '../metrics/metrics';
import { ReqContext } from '../types';

@Plugin()
export class GQLLoggerPlugin implements ApolloServerPlugin {
  protected logger = new Logger(GQLLoggerPlugin.name);

  constructor(private readonly metrics: Metrics) {}

  requestDidStart(
    reqContext: GraphQLRequestContext<ReqContext>
  ): Promise<GraphQLRequestListener<GraphQLRequestContext<ReqContext>>> {
    const res = reqContext.contextValue.req.res as Response;
    const operation = reqContext.request.operationName;
    const headers = reqContext.request.http?.headers;
    const requestId = headers
      ? headers.get(`${REQUEST_ID}`)
      : 'Unknown Request ID';
    const operationName = headers
      ? headers.get(`${OPERATION_NAME}`)
      : 'Unknown Operation Name';

    this.metrics.gqlRequest(1, { operation });
    const timer = this.metrics.gqlTimer({ operation });

    const requestInfo = `${REQUEST_ID}: ${requestId}, ${OPERATION_NAME}: ${operationName}`;

    return Promise.resolve({
      willSendResponse: () => {
        const costInMilliseconds = timer() * 1000;
        res.setHeader(
          'Server-Timing',
          `gql;dur=${costInMilliseconds};desc="GraphQL"`
        );
        this.logger.log(requestInfo);
        return Promise.resolve();
      },
      didEncounterErrors: () => {
        this.metrics.gqlError(1, { operation });
        const costInMilliseconds = timer() * 1000;
        res.setHeader(
          'Server-Timing',
          `gql;dur=${costInMilliseconds};desc="GraphQL ${operation}"`
        );
        this.logger.error(`${requestInfo}, query: ${reqContext.request.query}`);
        return Promise.resolve();
      },
    });
  }
}
