import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { AppError, errors } from '../../domain/errors.js';

function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Fastify will `reply.send()` whatever this handler *returns*.
 * Returning `reply.send(...)` re-enters the error chain and serializes the
 * original Error as `{ statusCode, error, message, code }`.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | AppError | ZodError, request, reply) => {
      if (isAppError(error)) {
        reply.status(error.status);
        return error.toJSON();
      }
      if (error instanceof ZodError) {
        reply.status(400);
        return errors.badRequest('Invalid request body.').toJSON();
      }
      const maybeStatus = (error as FastifyError).statusCode;
      const status: number =
        typeof maybeStatus === 'number' ? maybeStatus : 500;
      if (status === 429) {
        reply.status(429);
        return errors.tooManyRequests().toJSON();
      }
      request.log.error({ err: error }, 'unhandled_error');
      const safeStatus = status >= 400 ? status : 500;
      reply.status(safeStatus);
      return {
        error: safeStatus >= 500 ? 'internal_error' : (error as Error).name,
        message:
          safeStatus >= 500
            ? 'Internal Server Error'
            : (error as Error).message,
        requestId: request.requestId,
        status: safeStatus,
        code: safeStatus >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
        type: safeStatus >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
        name: safeStatus >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
      };
    }
  );

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: 'not_found',
      message: `No route ${request.method} ${request.url}`,
      requestId: request.requestId,
    });
  });
}
