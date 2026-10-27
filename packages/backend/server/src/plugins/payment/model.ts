import type { Entitlement, Prisma, ProviderSubscription } from '@prisma/client';

import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from './types';

export function visibleSubscriptionWhere(
  now = new Date()
): Prisma.ProviderSubscriptionWhereInput {
  return {
    status: {
      in: [
        SubscriptionStatus.Active,
        SubscriptionStatus.Trialing,
        SubscriptionStatus.PastDue,
      ],
    },
    OR: [{ periodEnd: null }, { periodEnd: { gt: now } }],
  };
}

export function visibleEntitlementWhere(
  targetType: 'user' | 'workspace',
  targetId: string
): Prisma.EntitlementWhereInput {
  const now = new Date();
  return {
    targetType,
    targetId,
    ...(env.selfhosted
      ? {
          source: 'selfhost_license',
          plan: 'selfhost_team',
          signedPayload: { not: null },
        }
      : { source: { in: ['cloud_subscription', 'admin_grant'] } }),
    OR: [
      {
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      { status: 'grace', graceUntil: { gt: now } },
    ],
  };
}

export interface Subscription {
  stripeSubscriptionId: string | null;
  stripeScheduleId: string | null;
  status: string;
  plan: string;
  recurring: string;
  variant: SubscriptionVariant | string | null;
  quantity: number;
  start: Date;
  end: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  nextBillAt: Date | null;
  canceledAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  provider?: string | null;
  iapStore?: string | null;
}

export interface Invoice {
  stripeInvoiceId?: string;
  currency: string;
  amount: number;
  status: string;
  reason: string | null;
  lastPaymentError: string | null;
  link: string | null;
}

export function subscriptionPlanFromEntitlement(plan: string) {
  return plan === 'lifetime_pro' ? SubscriptionPlan.Pro : plan;
}

export function subscriptionFromEntitlement(
  entitlement: Pick<
    Entitlement,
    | 'metadata'
    | 'plan'
    | 'status'
    | 'quantity'
    | 'startsAt'
    | 'createdAt'
    | 'expiresAt'
    | 'graceUntil'
    | 'updatedAt'
  >,
  providerFact:
    | Pick<
        ProviderSubscription,
        | 'metadata'
        | 'externalSubscriptionId'
        | 'status'
        | 'recurring'
        | 'quantity'
        | 'periodStart'
        | 'periodEnd'
        | 'trialStart'
        | 'trialEnd'
        | 'canceledAt'
        | 'createdAt'
        | 'updatedAt'
        | 'provider'
        | 'iapStore'
      >
    | undefined,
  plan: string
): Subscription {
  const metadata = entitlement.metadata as {
    provider?: string | null;
    recurring?: string | null;
    variant?: string | null;
    stripeSubscriptionId?: string | null;
  };
  const providerMetadata = providerFact?.metadata as {
    variant?: string | null;
    stripeScheduleId?: string | null;
    nextBillAt?: string | null;
  } | null;
  const rawVariant =
    providerMetadata?.variant ??
    metadata.variant ??
    (entitlement.plan === 'lifetime_pro' ? SubscriptionVariant.Onetime : null);

  return {
    stripeSubscriptionId:
      providerFact?.externalSubscriptionId ??
      metadata.stripeSubscriptionId ??
      null,
    stripeScheduleId: providerMetadata?.stripeScheduleId ?? null,
    status:
      providerFact?.status ??
      (entitlement.status === 'grace'
        ? SubscriptionStatus.PastDue
        : SubscriptionStatus.Active),
    plan,
    recurring:
      providerFact?.recurring ??
      metadata.recurring ??
      (entitlement.plan === 'lifetime_pro'
        ? SubscriptionRecurring.Lifetime
        : SubscriptionRecurring.Monthly),
    variant: rawVariant === SubscriptionVariant.Onetime ? rawVariant : null,
    quantity: providerFact?.quantity ?? entitlement.quantity ?? 1,
    start:
      providerFact?.periodStart ??
      entitlement.startsAt ??
      entitlement.createdAt,
    end: providerFact?.periodEnd ?? entitlement.expiresAt,
    trialStart: providerFact?.trialStart ?? null,
    trialEnd: providerFact?.trialEnd ?? null,
    nextBillAt: providerMetadata?.nextBillAt
      ? new Date(providerMetadata.nextBillAt)
      : providerFact?.canceledAt
        ? null
        : (providerFact?.periodEnd ?? entitlement.expiresAt),
    canceledAt: providerFact?.canceledAt ?? null,
    createdAt: providerFact?.createdAt ?? entitlement.createdAt,
    updatedAt: providerFact?.updatedAt ?? entitlement.updatedAt,
    provider: providerFact?.provider ?? metadata.provider ?? null,
    iapStore: providerFact?.iapStore ?? null,
  };
}
