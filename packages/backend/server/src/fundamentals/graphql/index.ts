import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Global, HttpException, HttpStatus, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { GraphQLError } from 'graphql';

import { Config } from '../config';
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
        const copilotAuthorization = config.featureFlags.copilotAuthorization;
        const cors = {
          cors: {
            origin: [
              'https://try-blocksuite.vercel.app/',
              'http://localhost:5173/',
            ],
          },
        };
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
          includeStacktraceInErrorResponses: !config.node.prod,
          plugins: [new GQLLoggerPlugin()],
          formatError: (formattedError, error) => {
            // @ts-expect-error allow assign
            formattedError.extensions ??= {};

            if (
              error instanceof GraphQLError &&
              error.originalError instanceof HttpException
            ) {
              const statusCode = error.originalError.getStatus();
              const statusName = HttpStatus[statusCode];

              // originally be 'INTERNAL_SERVER_ERROR'
              formattedError.extensions['code'] = statusCode;
              formattedError.extensions['status'] = statusName;
              delete formattedError.extensions['originalError'];

              return formattedError;
            } else {
              // @ts-expect-error allow assign
              formattedError.message = 'Internal Server Error';

              formattedError.extensions['code'] =
                HttpStatus.INTERNAL_SERVER_ERROR;
              formattedError.extensions['status'] =
                HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR];
            }

            return formattedError;
          },
          ...(copilotAuthorization ? cors : {}),
        };
      },
      inject: [Config],
    }),
  ],
})
export class GqlModule {}
