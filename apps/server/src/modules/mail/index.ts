import { Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { MAILER } from './mailer';

@Module({
  providers: [MAILER, MailService],
  exports: [MailService],
})
export class MailModule {}
