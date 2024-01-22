import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Global, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { Request, Response } from 'express';

import { Config } from '../config';
import { GQLLoggerPlugin } from './logger-plugin';

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
            config.node.test
              ? '../../../../node_modules/.cache/schema.gql'
              : '../../../schema.gql'
          ),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
            isAdminQuery: false,
          }),
          plugins: [new GQLLoggerPlugin()],
        };
      },
      inject: [Config],
    }),
  ],
})
export class GqlModule {}
