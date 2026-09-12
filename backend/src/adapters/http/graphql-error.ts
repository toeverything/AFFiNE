import { GraphQLError } from 'graphql';

import { AppError } from '../../domain/errors.js';

export function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof AppError) {
    return new GraphQLError(error.message, {
      extensions: { ...(error.toJSON() as unknown as Record<string, unknown>) },
      originalError: error,
    });
  }
  if (error instanceof GraphQLError) {
    return error;
  }
  return new GraphQLError('Internal Server Error', {
    extensions: {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      type: 'INTERNAL_SERVER_ERROR',
      name: 'INTERNAL_SERVER_ERROR',
      message: 'Internal Server Error',
    },
  });
}
