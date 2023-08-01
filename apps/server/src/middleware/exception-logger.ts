import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Request } from 'express';

import { REQUEST_ID } from '../constants';

@Catch()
export class ExceptionLogger implements ExceptionFilter {
  private logger = new Logger('ExceptionLogger');

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const requestId = request?.header(REQUEST_ID);
    this.logger.error(
      `${requestId ? `${requestId}:` : ''}${exception.message}`,
      exception.stack
    );
  }
}
