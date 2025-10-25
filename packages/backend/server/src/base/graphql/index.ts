import './config';

import { join } from 'node:path';

import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Global, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request, Response } from 'express';

import { NodeEnv } from '../../env';
import { Config } from '../config';
import { mapAnyError } from '../nestjs/exception';
import { GQLLoggerPlugin } from './logger-plugin';

export type GraphqlContext = {
  req: Request;
  res: Response;
  isAdminQuery: boolean;
};

@Global()
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (config: Config) => {
        return {
          ...config.graphql.apolloDriverConfig,
          buildSchemaOptions: {
            numberScalarMode: 'integer',
          },
          useGlobalPrefix: true,
          graphiql: env.NODE_ENV === NodeEnv.Development,
          sortSchema: true,
          autoSchemaFile: join(
            env.projectRoot,
            env.testing
              ? './node_modules/.cache/schema.gql'
              : './src/schema.gql'
          ),
          path: '/graphql',
          csrfPrevention: {
            requestHeaders: ['content-type'],
          },
          context: ({
            req,
            res,
          }: {
            req: Request;
            res: Response;
          }): GraphqlContext => ({
            req,
            res,
            isAdminQuery: false,
          }),
          plugins: [new GQLLoggerPlugin()],
          formatError: (formattedError, error) => {
            let ufe = mapAnyError(error);

            // @ts-expect-error allow assign
            formattedError.extensions = ufe.toJSON();
            if (env.namespaces.canary) {
              formattedError.extensions.stacktrace = ufe.stacktrace;
            }
            return formattedError;
          },
        };
      },
      inject: [Config],
    }),
  ],
})
export class GqlModule {}

export * from './pagination';
export { registerObjectType } from './register';
