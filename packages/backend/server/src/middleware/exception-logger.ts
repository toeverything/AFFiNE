import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GqlContextType } from '@nestjs/graphql';
import { Request, Response } from 'express';

import { REQUEST_ID } from '../constants';
const TrivialExceptions = [NotFoundException];

@Catch()
export class ExceptionLogger implements ExceptionFilter {
  private logger = new Logger('ExceptionLogger');

  catch(exception: Error, host: ArgumentsHost) {
    // with useGlobalFilters, the context is always HTTP
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<Request>();
    const requestId = request?.header(REQUEST_ID);

    const shouldVerboseLog = !TrivialExceptions.some(
      e => exception instanceof e
    );
    this.logger.error(
      new Error(
        `${requestId ? `requestId-${requestId}: ` : ''}${exception.message}${
          shouldVerboseLog ? '\n' + exception.stack : ''
        }`,
        { cause: exception }
      )
    );

    if (host.getType<GqlContextType>() === 'graphql') {
      return;
    }

    const response = ctx.getResponse<Response>();
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
    } else {
      response.status(500).json({
        statusCode: 500,
        error: exception.message,
      });
    }
  }
}
