import './config';

import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { StorageModule } from '../storage';
import { MailJob } from './job';
import { Mailer } from './mailer';
import { MailSender } from './sender';

@Module({
  imports: [DocStorageModule, StorageModule],
  providers: [MailSender, Mailer, MailJob],
  exports: [Mailer],
})
export class MailModule {}
export { Mailer };
