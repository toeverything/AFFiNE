import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { Plugin } from '@nestjs/apollo';

import { Metrics } from '../metrics/metrics';

@Plugin()
export class MetricsPlugin implements ApolloServerPlugin {
  constructor(private readonly metrics: Metrics) {}

  requestDidStart(
    reqContext: GraphQLRequestContext<{ req: Express.Request }>
  ): Promise<
    GraphQLRequestListener<GraphQLRequestContext<{ req: Express.Request }>>
  > {
    const operation = reqContext.request.operationName;
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
