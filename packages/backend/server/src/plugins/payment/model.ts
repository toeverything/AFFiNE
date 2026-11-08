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

export type NativeSubscription = {
  [Field in keyof Subscription]: Subscription[Field] extends Date | null
    ? string | Exclude<Subscription[Field], Date>
    : Subscription[Field];
};

export interface Invoice {
  stripeInvoiceId?: string;
  currency: string;
  amount: number;
  status: string;
  reason: string | null;
  lastPaymentError: string | null;
  link: string | null;
}

export function normalizeSubscription(
  subscription: NativeSubscription
): Subscription {
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
