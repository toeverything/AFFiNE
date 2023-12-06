import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Global, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { Config } from './config';
import { GQLLoggerPlugin } from './graphql/logger-plugin';

@Global()
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (config: Config) => {
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
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
          plugins: [new GQLLoggerPlugin()],
        };
      },
      inject: [Config],
    }),
  ],
})
export class GqlModule {}
