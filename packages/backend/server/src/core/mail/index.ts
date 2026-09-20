import './config';

import { Module } from '@nestjs/common';

import { BackendRuntimeModule } from '../backend-runtime';
import { DocStorageModule } from '../doc';
import { StorageModule } from '../storage';
import { MailDeliveryEvents } from './events';
import { MailJob } from './job';
import { Mailer } from './mailer';
import { MailResolver } from './resolver';
import { MailSender } from './sender';

@Module({
  imports: [BackendRuntimeModule, DocStorageModule, StorageModule],
  providers: [MailSender, Mailer, MailResolver, MailDeliveryEvents],
  exports: [Mailer, MailSender],
})
export class MailModule {}

@Module({
  imports: [MailModule, DocStorageModule],
  providers: [MailJob],
})
export class MailWorkerModule {}
export { Mailer };
