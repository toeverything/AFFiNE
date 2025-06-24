import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { FeatureModule } from '../../core/features';
import { MailModule } from '../../core/mail';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { UserModule } from '../../core/user';
import { WorkspaceModule } from '../../core/workspaces';
import { StripeWebhookController } from './controller';
import { SubscriptionCronJobs } from './cron';
import { PaymentEventHandlers } from './event';
import { LicenseController } from './license/controller';
import {
  SelfhostTeamSubscriptionManager,
  UserSubscriptionManager,
  WorkspaceSubscriptionManager,
} from './manager';
import {
  SubscriptionResolver,
  UserSubscriptionResolver,
  WorkspaceSubscriptionResolver,
} from './resolver';
import { SubscriptionService } from './service';
import { StripeFactory, StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Module({
  imports: [
    FeatureModule,
    QuotaModule,
    UserModule,
    PermissionModule,
    WorkspaceModule,
    MailModule,
    ServerConfigModule,
  ],
  providers: [
    StripeFactory,
    StripeProvider,
    SubscriptionService,
    SubscriptionResolver,
    UserSubscriptionResolver,
    StripeWebhook,
    UserSubscriptionManager,
    WorkspaceSubscriptionManager,
    SelfhostTeamSubscriptionManager,
    SubscriptionCronJobs,
    WorkspaceSubscriptionResolver,
    PaymentEventHandlers,
  ],
  controllers: [StripeWebhookController, LicenseController],
})
export class PaymentModule {}
