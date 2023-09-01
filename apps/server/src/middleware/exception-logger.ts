import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { REQUEST_ID } from '../constants';

@Catch(HttpException)
export class ExceptionLogger implements ExceptionFilter {
  private logger = new Logger('ExceptionLogger');

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const requestId = request?.header(REQUEST_ID);
    this.logger.error(
      new Error(
        `${requestId ? `requestId-${requestId}:` : ''}${exception.message}`,
        { cause: exception }
      ),
      exception.stack
    );

    const response = ctx.getResponse<Response>();
    if (exception instanceof HttpException) {
      response.json(exception.getResponse());
    } else {
      response.status(500).json({
        message: exception.message,
        statusCode: 500,
      });
    }
  }
}
