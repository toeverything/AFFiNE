import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';

import { Metrics } from '../metrics/metrics';

const OPERATION_NAME = 'x-operation-name';
const REQUEST_ID = 'x-request-id';

@Plugin()
export class LoggerPlugin implements ApolloServerPlugin {
  protected logger = new Logger(LoggerPlugin.name);

  constructor(private readonly metrics: Metrics) {}

  requestDidStart(
    reqContext: GraphQLRequestContext<{ req: Express.Request }>
  ): Promise<
    GraphQLRequestListener<GraphQLRequestContext<{ req: Express.Request }>>
  > {
    const operation = reqContext.request.operationName;
    const headers = reqContext.request.http?.headers;
    const requestId = headers
      ? headers.get(`${REQUEST_ID}`)
      : 'Unknown Request ID';
    const operationName = headers
      ? headers.get(`${OPERATION_NAME}`)
      : 'Unknown Operation Name';

    this.logger.log(
      `${REQUEST_ID}: ${requestId}, ${OPERATION_NAME}: ${operationName}, query: ${reqContext.request.query}, variables: ${reqContext.request.variables}`
    );
    this.metrics.gqlRequest(1, { operation });

    return Promise.resolve({
      willSendResponse: () => {
        return Promise.resolve();
      },
      didEncounterErrors: () => {
        this.metrics.gqlError(1, { operation });
        return Promise.resolve();
      },
    });
  }
}
