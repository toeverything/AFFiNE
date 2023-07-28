import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Global, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { Config } from './config';
import { GQLLoggerPlugin } from './graphql/logger-plugin';
import { Metrics } from './metrics/metrics';

@Global()
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (config: Config, metrics: Metrics) => {
        return {
          ...config.graphql,
          path: `${config.path}/graphql`,
          csrfPrevention: {
            requestHeaders: ['content-type'],
          },
          autoSchemaFile: join(
            fileURLToPath(import.meta.url),
            '..',
            'schema.gql'
          ),
          plugins: [new GQLLoggerPlugin(metrics)],
        };
      },
      inject: [Config, Metrics],
    }),
  ],
})
export class GqlModule {}
