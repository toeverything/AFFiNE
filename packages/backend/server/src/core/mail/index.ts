import './config';

import { Module } from '@nestjs/common';

import { BackendRuntimeModule } from '../backend-runtime';
import { DocStorageModule } from '../doc';
import { StorageModule } from '../storage';
import { MailJob } from './job';
import { Mailer } from './mailer';
import { MailResolver } from './resolver';
import { MailSender } from './sender';

@Module({
  imports: [BackendRuntimeModule, DocStorageModule, StorageModule],
  providers: [MailSender, Mailer, MailJob, MailResolver],
  exports: [Mailer],
})
export class MailModule {}
export { Mailer };
