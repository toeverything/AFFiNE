import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { FeatureModule } from '../../core/features';
import { PermissionModule } from '../../core/permission';
import { UserModule } from '../../core/user';
import { WorkspaceModule } from '../../core/workspaces';
import { StripeWebhookController } from './controller';
import { PaymentEventHandlers } from './event';
import {
  LegacyLicenseController,
  LicenseController,
} from './license-controller';
import {
  UserSubscriptionResolver,
  WorkspaceSubscriptionResolver,
} from './read-resolver';
import { SubscriptionResolver } from './resolver';
import { RevenueCatWebhookController } from './revenuecat-controller';
import { SubscriptionService } from './service';

@Module({
  imports: [
    FeatureModule,
    UserModule,
    PermissionModule,
    WorkspaceModule,
    ServerConfigModule,
  ],
  providers: [
    SubscriptionService,
    SubscriptionResolver,
    UserSubscriptionResolver,
    WorkspaceSubscriptionResolver,
    PaymentEventHandlers,
  ],
  controllers: [
    StripeWebhookController,
    LicenseController,
    LegacyLicenseController,
    RevenueCatWebhookController,
  ],
})
export class PaymentModule {}
