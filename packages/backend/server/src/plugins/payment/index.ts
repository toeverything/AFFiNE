import { ServerFeature } from '../../core/config';
import { FeatureModule } from '../../core/features';
import { OptionalModule } from '../../fundamentals';
import { SubscriptionResolver, UserSubscriptionResolver } from './resolver';
import { ScheduleManager } from './schedule';
import { SubscriptionService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@OptionalModule({
  imports: [FeatureModule],
  providers: [
    ScheduleManager,
    StripeProvider,
    SubscriptionService,
    SubscriptionResolver,
    UserSubscriptionResolver,
  ],
  controllers: [StripeWebhook],
  // TODO(@forehalo): enable this requirements when conditional query is implemented in frontend
  // requires: [
  //   'plugins.payment.stripe.keys.APIKey',
  //   'plugins.payment.stripe.keys.webhookKey',
  // ],
  contributesTo: ServerFeature.Payment,
  if: config => config.flavor.graphql,
})
export class PaymentModule {}

export type { PaymentConfig } from './types';
