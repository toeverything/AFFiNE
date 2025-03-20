import './config';

import { ServerFeature } from '../../core/config';
import { FeatureModule } from '../../core/features';
import { MailModule } from '../../core/mail';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { UserModule } from '../../core/user';
import { WorkspaceModule } from '../../core/workspaces';
import { Plugin } from '../registry';
import { StripeWebhookController } from './controller';
import { SubscriptionCronJobs } from './cron';
import { LicenseController } from './license/controller';
import {
  SelfhostTeamSubscriptionManager,
  UserSubscriptionManager,
  WorkspaceSubscriptionManager,
} from './manager';
import { QuotaOverride } from './quota';
import {
  SubscriptionResolver,
  UserSubscriptionResolver,
  WorkspaceSubscriptionResolver,
} from './resolver';
import { SubscriptionService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Plugin({
  name: 'payment',
  imports: [
    FeatureModule,
    QuotaModule,
    UserModule,
    PermissionModule,
    WorkspaceModule,
    MailModule,
  ],
  providers: [
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
    QuotaOverride,
  ],
  controllers: [StripeWebhookController, LicenseController],
  requires: [
    'plugins.payment.stripe.keys.APIKey',
    'plugins.payment.stripe.keys.webhookKey',
  ],
  contributesTo: ServerFeature.Payment,
  if: config => config.flavor.graphql,
})
export class PaymentModule {}
