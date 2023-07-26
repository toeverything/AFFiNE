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
export class GQLLoggerPlugin implements ApolloServerPlugin {
  protected logger = new Logger(GQLLoggerPlugin.name);

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

    this.metrics.gqlRequest(1, { operation });

    const requestInfo = `${REQUEST_ID}: ${requestId}, ${OPERATION_NAME}: ${operationName}`;

    return Promise.resolve({
      willSendResponse: () => {
        this.logger.log(requestInfo);
        return Promise.resolve();
      },
      didEncounterErrors: () => {
        this.metrics.gqlError(1, { operation });
        const variables = reqContext.request.variables;
        this.logger.error(
          `${requestInfo}, query: ${reqContext.request.query}, ${
            variables ? `variables: ${JSON.stringify(variables)}` : ''
          }`
        );
        return Promise.resolve();
      },
    });
  }
}
