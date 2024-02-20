import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentRequiredException extends HttpException {
  constructor(desc?: string, code: string = 'Payment Required') {
    super(
      HttpException.createBody(desc ?? code, code, HttpStatus.PAYMENT_REQUIRED),
      HttpStatus.PAYMENT_REQUIRED
    );
  }
}
