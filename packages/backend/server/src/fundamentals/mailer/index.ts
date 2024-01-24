import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { MAILER } from './mailer';

@Global()
@Module({
  providers: [MAILER, MailService],
  exports: [MailService],
})
export class MailModule {}
export { MailService };
