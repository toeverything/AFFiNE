/**
 * @vitest-environment happy-dom
 */

import type { SubscriptionType } from '@affine/core/modules/cloud/entities/subscription';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { AIPlanCard } from './ai-plan-card';
import { PaymentMethod } from './payment-method';

const { openExternal, triggerPortal, subscriptionService } = vi.hoisted(() => ({
  openExternal: vi.fn(),
  triggerPortal: vi.fn(),
  subscriptionService: {
    subscription: { ai$: { value: null as SubscriptionType | null } },
    prices: { aiPrice$: { value: { yearlyAmount: 12000 } } },
  },
}));

vi.mock('@affine/core/modules/cloud', () => ({
  SubscriptionService: 'subscription',
}));
vi.mock('@affine/core/modules/url', () => ({ UrlService: 'url' }));
vi.mock('@toeverything/infra', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useService: (token: string) =>
    token === 'subscription' ? subscriptionService : { openExternal },
  useLiveData: <T,>(source: { value: T }) => source.value,
}));
vi.mock('../../../../../components/hooks/use-mutation', () => ({
  useMutation: () => ({ trigger: triggerPortal, isMutating: false }),
}));
vi.mock('../plans/actions', () => ({
  CancelAction: ({ children }: PropsWithChildren) => children,
  ResumeAction: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../plans/ai/actions', () => ({
  AICancel: () => <button>Cancel AI</button>,
  AIResume: () => <button>Resume AI</button>,
  AISubscribe: () => <button>Subscribe to AI</button>,
}));
vi.mock('@affine/i18n', () => ({
  i18nTime: () => '',
  useI18n: () => new Proxy({}, { get: (_, key) => () => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const stripeSubscription: SubscriptionType = {
  id: 'sub_stripe',
  provider: 'stripe',
  iapStore: null,
  plan: SubscriptionPlan.Pro,
  status: SubscriptionStatus.Active,
  recurring: SubscriptionRecurring.Yearly,
  start: '2026-09-06T00:00:00.000Z',
  end: null,
  nextBillAt: null,
  canceledAt: null,
  variant: null,
};

test('Pro opens the bound store and reserves cancellation and portal actions for Stripe', async () => {
  const appStore = {
    ...stripeSubscription,
    provider: 'revenuecat',
    iapStore: 'app_store',
  };
  const view = render(<PaymentMethod subscription={appStore} />);
  screen.getByText('App Store');
  fireEvent.click(
    screen.getByRole('button', {
      name: 'com.affine.payment.billing-setting.payment-method.go',
    })
  );
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    'https://support.apple.com/billing'
  );
  expect(triggerPortal).not.toHaveBeenCalled();
  expect(
    screen.queryByText('com.affine.payment.billing-setting.cancel-subscription')
  ).toBeNull();

  triggerPortal.mockResolvedValueOnce(undefined);
  view.rerender(<PaymentMethod subscription={stripeSubscription} />);
  screen.getByText('com.affine.payment.billing-setting.cancel-subscription');
  fireEvent.click(
    screen.getByRole('button', {
      name: 'com.affine.payment.billing-setting.payment-method.go',
    })
  );
  await waitFor(() => expect(triggerPortal).toHaveBeenCalledTimes(1));
});

test('AI opens the bound store without Stripe actions and preserves Stripe resume', () => {
  const aiSubscription = {
    ...stripeSubscription,
    plan: SubscriptionPlan.AI,
    canceledAt: '2026-11-05T00:00:00.000Z',
    status: SubscriptionStatus.PastDue,
  };
  subscriptionService.subscription.ai$.value = {
    ...aiSubscription,
    provider: 'revenuecat',
    iapStore: 'play_store',
  };
  const onClick = vi.fn();
  const view = render(<AIPlanCard onClick={onClick} />);
  fireEvent.click(screen.getByRole('button', { name: 'Google Play' }));
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    'https://play.google.com/store/account/subscriptions'
  );
  expect(screen.queryByRole('button', { name: 'Resume AI' })).toBeNull();
  expect(
    screen.queryByRole('button', {
      name: 'com.affine.payment.billing-setting.payment-method',
    })
  ).toBeNull();

  subscriptionService.subscription.ai$.value = aiSubscription;
  view.rerender(<AIPlanCard onClick={onClick} />);
  screen.getByRole('button', { name: 'Resume AI' });
  screen.getByRole('button', {
    name: 'com.affine.payment.billing-setting.payment-method',
  });
});
