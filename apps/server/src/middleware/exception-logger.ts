import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { REQUEST_ID } from '../constants';

@Catch()
export class ExceptionLogger implements ExceptionFilter {
  private logger = new Logger('ExceptionLogger');

  catch(exception: Error, host: ArgumentsHost) {
    // with useGlobalFilters, the context is always HTTP
    const ctx = host.switchToHttp();

    // TODO: temporary, remove this after stable
    if (host.getType() !== 'http') {
      this.logger.error(`Unexpected request type caught: ${host.getType()}`);
      if (host.getType() === 'ws') {
        const ctx = host.switchToWs();
        this.logger.error(
          `WebSocket context: ${JSON.stringify(
            ctx.getClient()
          )} ${JSON.stringify(ctx.getPattern())}`
        );
      } else if (host.getType() === 'rpc') {
        const ctx = host.switchToRpc();
        this.logger.error(`RPC context: ${JSON.stringify(ctx.getContext())}`);
      }
      return;
    }

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
      if (!response.status) {
        this.logger.warn(`Unexpected: response has no status method, request info:\n url: ${request.url} \n method: ${request.method} \n body: ${request.body}`);
      } else {
        response.status(exception.getStatus());
      }
      response.json(exception.getResponse());
    } else {
      response.status(500).json({
        statusCode: 500,
        error: exception.message,
      });
    }
  }
}
