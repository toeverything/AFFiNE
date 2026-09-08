import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  CantUpdateOnetimePaymentSubscription,
  Config,
  CustomerPortalCreateFailed,
  InvalidCheckoutParameters,
  InvalidLicenseSessionId,
  LicenseRevealed,
  ManagedByAppStoreOrPlay,
  SameSubscriptionRecurring,
  SubscriptionAlreadyExists,
  SubscriptionHasBeenCanceled,
  SubscriptionHasNotBeenCanceled,
  SubscriptionNotExists,
  SubscriptionPlanNotFound,
  UserNotFound,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from './types';

export const CheckoutParams = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
  recurring: z.nativeEnum(SubscriptionRecurring),
  variant: z.nativeEnum(SubscriptionVariant).nullable().optional(),
  coupon: z.string().nullable().optional(),
  quantity: z.number().min(1).nullable().optional(),
  successCallbackLink: z.string(),
  idempotencyKey: z.string().optional(),
});

const CheckoutExtraArgs = z.object({
  user: z.object({ id: z.string(), email: z.string() }).nullable().optional(),
  workspaceId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
});

type SubscriptionIdentity =
  | { plan: SubscriptionPlan.Pro | SubscriptionPlan.AI; userId: string }
  | {
      plan: SubscriptionPlan.Team;
      workspaceId: string;
      actorUserId?: string;
    }
  | { plan: SubscriptionPlan.SelfHostedTeam; key: string };

export interface Subscription {
  stripeSubscriptionId: string | null;
  stripeScheduleId: string | null;
  status: string;
  plan: string;
  recurring: string;
  variant: string | null;
  quantity: number;
  start: Date;
  end: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  nextBillAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  provider?: string | null;
  iapStore?: string | null;
}

interface NativePrice {
  id: string;
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
  variant: SubscriptionVariant | null;
  currency: string;
  amount: number | null;
}

export interface PaymentPrice {
  lookupKey: Pick<NativePrice, 'plan' | 'recurring' | 'variant'>;
  price: { id: string; currency: string; unit_amount: number | null };
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly runtime: BackendRuntimeProvider,
    private readonly config: Config
  ) {}

  async listPrices(_user?: CurrentUser): Promise<PaymentPrice[]> {
    const prices = await this.command<NativePrice[]>({ action: 'list_prices' });
    return prices
      .filter(({ plan, recurring, variant }) => {
        if (plan === SubscriptionPlan.Team) return true;
        if (variant) return false;
        if (plan === SubscriptionPlan.AI) {
          return recurring !== SubscriptionRecurring.Lifetime;
        }
        if (plan === SubscriptionPlan.Pro) {
          return (
            recurring !== SubscriptionRecurring.Lifetime ||
            this.config.payment.showLifetimePrice
          );
        }
        return false;
      })
      .map(({ id, plan, recurring, variant, currency, amount }) => ({
        lookupKey: { plan, recurring, variant },
        price: { id, currency, unit_amount: amount },
      }));
  }

  async checkout(
    params: z.infer<typeof CheckoutParams>,
    rawArgs: z.infer<typeof CheckoutExtraArgs>
  ) {
    const parsed = CheckoutExtraArgs.safeParse(rawArgs);
    if (!parsed.success) throw new InvalidCheckoutParameters();
    const args = parsed.data;
    const target = checkoutTarget(params.plan, args);
    const result = await this.command<{
      url: string;
      sessionId: string;
      targetId: string;
    }>({
      action: 'create_checkout',
      actorUserId: args.user?.id,
      userEmail: args.user?.email,
      targetType: target.type,
      targetId: target.id,
      plan: params.plan,
      recurring: params.recurring,
      variant: params.variant,
      coupon: params.coupon,
      quantity: args.quantity ?? params.quantity ?? undefined,
      successUrl: params.successCallbackLink,
      intentId: params.idempotencyKey ?? randomUUID(),
    });
    return { id: result.sessionId, url: result.url };
  }

  async cancelSubscription(
    identity: SubscriptionIdentity,
    idempotencyKey?: string
  ) {
    return this.mutate(identity, 'cancel', idempotencyKey);
  }

  async resumeSubscription(
    identity: SubscriptionIdentity,
    idempotencyKey?: string
  ) {
    return this.mutate(identity, 'resume', idempotencyKey);
  }

  async updateSubscriptionRecurring(
    identity: SubscriptionIdentity,
    recurring: SubscriptionRecurring,
    idempotencyKey?: string
  ) {
    const target = subscriptionTarget(identity);
    const subscription = await this.command<Subscription>({
      action: 'update_recurring',
      actorUserId: target.actor,
      targetType: target.type,
      targetId: target.id,
      plan: identity.plan,
      recurring,
      intentId: idempotencyKey ?? randomUUID(),
    });
    return normalizeSubscription(subscription);
  }

  async updateSubscriptionQuantity(
    identity: SubscriptionIdentity,
    quantity: number
  ) {
    const target = subscriptionTarget(identity);
    await this.command({
      action: 'update_quantity',
      actorUserId: target.actor,
      targetType: target.type,
      targetId: target.id,
      plan: identity.plan,
      quantity,
      intentId: randomUUID(),
    });
  }

  async generateLicenseKey(sessionId: string) {
    if (!sessionId) throw new InvalidLicenseSessionId();
    return this.command<string>({
      action: 'reveal_license',
      sessionId,
      intentId: randomUUID(),
    });
  }

  async createCustomerPortal(userId: string) {
    try {
      return await this.runtime.createPaymentCustomerPortalV1(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('payment_customer_not_found')) {
        throw new UserNotFound();
      }
      throw new CustomerPortalCreateFailed();
    }
  }

  private async mutate(
    identity: SubscriptionIdentity,
    mutation: 'cancel' | 'resume',
    idempotencyKey?: string
  ) {
    const target = subscriptionTarget(identity);
    const subscription = await this.command<Subscription>({
      action: 'mutate_subscription',
      actorUserId: target.actor ?? target.id,
      targetType: target.type,
      targetId: target.id,
      plan: identity.plan,
      mutation,
      intentId: idempotencyKey ?? randomUUID(),
    });
    return normalizeSubscription(subscription);
  }

  private async command<T = unknown>(input: Record<string, unknown>) {
    try {
      return await this.runtime.executePaymentCommandV1<T>(input);
    } catch (error) {
      throw mapPaymentError(error, input);
    }
  }
}

function checkoutTarget(
  plan: SubscriptionPlan,
  args: z.infer<typeof CheckoutExtraArgs>
) {
  if (plan === SubscriptionPlan.SelfHostedTeam)
    return { type: 'instance', id: undefined };
  if (plan === SubscriptionPlan.Team) {
    if (!args.workspaceId) throw new InvalidCheckoutParameters();
    return { type: 'workspace', id: args.workspaceId };
  }
  if (!args.user) throw new InvalidCheckoutParameters();
  return { type: 'user', id: args.user.id };
}

function subscriptionTarget(identity: SubscriptionIdentity) {
  if ('userId' in identity)
    return { type: 'user', id: identity.userId, actor: identity.userId };
  if ('workspaceId' in identity) {
    return {
      type: 'workspace',
      id: identity.workspaceId,
      actor: identity.actorUserId,
    };
  }
  return { type: 'instance', id: identity.key, actor: undefined };
}

export function userSubscriptionIdentity(
  plan: SubscriptionPlan,
  userId: string
): SubscriptionIdentity {
  if (plan !== SubscriptionPlan.Pro && plan !== SubscriptionPlan.AI) {
    throw new SubscriptionNotExists({ plan });
  }
  return { plan, userId };
}

function mapPaymentError(error: unknown, input: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const plan = input.plan as SubscriptionPlan | undefined;
  const recurring = input.recurring as SubscriptionRecurring | undefined;
  if (message.includes('subscription_not_found')) {
    return new SubscriptionNotExists({ plan: plan ?? SubscriptionPlan.Pro });
  }
  if (message.includes('subscription_plan_not_found')) {
    return new SubscriptionPlanNotFound({
      plan: plan ?? SubscriptionPlan.Pro,
      recurring: recurring ?? SubscriptionRecurring.Monthly,
    });
  }
  if (message.includes('managed_by_app_store'))
    return new ManagedByAppStoreOrPlay();
  if (message.includes('cant_update_onetime_subscription')) {
    return new CantUpdateOnetimePaymentSubscription();
  }
  if (message.includes('subscription_already_canceled'))
    return new SubscriptionHasBeenCanceled();
  if (message.includes('subscription_not_canceled'))
    return new SubscriptionHasNotBeenCanceled();
  if (message.includes('same_subscription_recurring')) {
    return new SameSubscriptionRecurring({
      recurring: recurring ?? SubscriptionRecurring.Monthly,
    });
  }
  if (message.includes('subscription_already_exists')) {
    return new SubscriptionAlreadyExists({
      plan: plan ?? SubscriptionPlan.Pro,
    });
  }
  if (message.includes('license_already_revealed'))
    return new LicenseRevealed();
  if (message.includes('invalid_license_session')) {
    return new InvalidLicenseSessionId();
  }
  if (message.includes('invalid checkout parameters'))
    return new InvalidCheckoutParameters();
  return error;
}

function normalizeSubscription(subscription: Subscription): Subscription {
  return {
    ...subscription,
    start: new Date(subscription.start),
    end: subscription.end ? new Date(subscription.end) : null,
    trialStart: subscription.trialStart
      ? new Date(subscription.trialStart)
      : null,
    trialEnd: subscription.trialEnd ? new Date(subscription.trialEnd) : null,
    nextBillAt: subscription.nextBillAt
      ? new Date(subscription.nextBillAt)
      : null,
    canceledAt: subscription.canceledAt
      ? new Date(subscription.canceledAt)
      : null,
    createdAt: new Date(subscription.createdAt),
    updatedAt: new Date(subscription.updatedAt),
  };
}
