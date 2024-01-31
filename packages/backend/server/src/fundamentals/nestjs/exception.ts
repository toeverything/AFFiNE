import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  override catch(exception: Error, host: ArgumentsHost) {
    // with useGlobalFilters, the context is always HTTP

    if (host.getType<GqlContextType>() === 'graphql') {
      // let Graphql LoggerPlugin handle it
      // see '../graphql/logger-plugin.ts'
      throw exception;
    } else {
      if (exception instanceof HttpException) {
        const res = host.switchToHttp().getResponse<Response>();
        res.status(exception.getStatus()).send(exception.getResponse());
        return;
      } else {
        super.catch(exception, host);
      }
    }
  }
}
