import { useUpgradeNotify } from '@affine/core/components/affine/subscription-landing/notify';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { track } from '@affine/track';
import { nanoid } from 'nanoid';
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { type AuthAccountInfo } from '../../../modules/cloud';

const separator = '::';
const recoverSeparator = nanoid();
const localStorageKey = 'subscription-succeed-info';

const typeFormUrl = 'https://6dxre9ihosp.typeform.com/to';
const typeFormUpgradeId = 'mUMGGQS8';
const typeFormDowngradeId = 'RvD9AoRg';

type TypeFormInfo = {
  id: string;
  name?: string;
  email?: string;
  plan: string | string[];
  recurring: string;
};
const getTypeFormLink = (id: string, info: TypeFormInfo) => {
  const plans = Array.isArray(info.plan) ? info.plan : [info.plan];
  const product_id = plans
    .map(plan => (plan === SubscriptionPlan.AI ? 'ai' : 'cloud'))
    .join('-');
  const product_price =
    info.recurring === SubscriptionRecurring.Monthly
      ? 'monthly'
      : info.recurring === SubscriptionRecurring.Lifetime
        ? 'lifeTime'
        : 'annually';
  return `${typeFormUrl}/${id}#email=${info.email ?? ''}&name=${info.name ?? 'Unknown'}&user_id=${info.id}&product_id=${product_id}&product_price=${product_price}`;
};
export const getUpgradeQuestionnaireLink = (info: TypeFormInfo) =>
  getTypeFormLink(typeFormUpgradeId, info);
export const getDowngradeQuestionnaireLink = (info: TypeFormInfo) =>
  getTypeFormLink(typeFormDowngradeId, info);

/**
 * Generate subscription callback link with account info
 */
export const generateSubscriptionCallbackLink = (
  account: AuthAccountInfo | null,
  plan: SubscriptionPlan,
  recurring: SubscriptionRecurring
) => {
  if (account === null) {
    throw new Error('Account is required');
  }
  const baseUrl =
    plan === SubscriptionPlan.AI ? '/ai-upgrade-success' : '/upgrade-success';

  let name = account?.info?.name ?? '';
  if (name.includes(separator)) {
    name = name.replaceAll(separator, recoverSeparator);
  }

  const query = [
    plan,
    recurring,
    account.id,
    account.email,
    account.info?.name ?? '',
  ].join(separator);

  return `${baseUrl}?info=${encodeURIComponent(query)}`;
};

/**
 * Parse subscription callback query.info
 * @returns
 */
export const parseSubscriptionCallbackLink = (query: string) => {
  const [plan, recurring, id, email, rawName] =
    decodeURIComponent(query).split(separator);
  const name = rawName.replaceAll(recoverSeparator, separator);

  return {
    plan: plan as SubscriptionPlan,
    recurring: recurring as SubscriptionRecurring,
    account: {
      id,
      email,
      info: {
        name,
      },
    },
  };
};

/**
 * Hook to parse subscription callback link, and save to local storage and delete the query
 */
export const useSubscriptionNotifyWriter = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const query = searchParams.get('info');
    if (query) {
      localStorage.setItem(localStorageKey, query);
      searchParams.delete('info');
    }
  }, [searchParams]);
};

/**
 * Hook to read and parse subscription info from localStorage
 */
export const useSubscriptionNotifyReader = () => {
  const upgradeNotify = useUpgradeNotify();

  const readAndNotify = useCallback(() => {
    const query = localStorage.getItem(localStorageKey);
    if (!query) return;

    try {
      const { plan, recurring, account } = parseSubscriptionCallbackLink(query);
      const link = getUpgradeQuestionnaireLink({
        id: account.id,
        email: account.email,
        name: account.info?.name ?? '',
        plan,
        recurring,
      });
      upgradeNotify(link);
      localStorage.removeItem(localStorageKey);

      track.$.settingsPanel.plans.subscribe({
        plan,
        recurring,
      });
    } catch (err) {
      console.error('Failed to parse subscription callback link', err);
    }
  }, [upgradeNotify]);

  useEffect(() => {
    readAndNotify();
    window.addEventListener('focus', readAndNotify);
    return () => {
      window.removeEventListener('focus', readAndNotify);
    };
  }, [readAndNotify]);
};
