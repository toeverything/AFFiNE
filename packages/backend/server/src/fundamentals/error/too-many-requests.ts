import { HttpException, HttpStatus } from '@nestjs/common';

export class TooManyRequestsException extends HttpException {
  constructor(desc?: string, code: string = 'Too Many Requests') {
    super(
      HttpException.createBody(
        desc ?? code,
        code,
        HttpStatus.TOO_MANY_REQUESTS
      ),
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
