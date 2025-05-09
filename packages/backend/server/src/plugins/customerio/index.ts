import './config';

import { Module } from '@nestjs/common';

import { CustomerIoService } from './service';

@Module({
  providers: [CustomerIoService],
})
export class CustomerIoModule {}
