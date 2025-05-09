import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
import type { FallbackProps } from 'react-error-boundary';

import { SWRErrorBoundary } from '../../../../../components/pure/swr-error-bundary';
import { SubscriptionService } from '../../../../../modules/cloud';
import { AIPlan } from './ai/ai-plan';
import { CloudPlans } from './cloud-plans';
import { CloudPlanLayout, PlanLayout } from './layout';
import { PlansSkeleton } from './skeleton';
import * as styles from './style.css';

const Settings = () => {
  const subscriptionService = useService(SubscriptionService);
  const prices = useLiveData(subscriptionService.prices.prices$);

  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  if (prices === null) {
    return <PlansSkeleton />;
  }

  return <PlanLayout cloud={<CloudPlans />} ai={<AIPlan />} />;
};

export const AFFiNEPricingPlans = () => {
  return (
    <SWRErrorBoundary FallbackComponent={PlansErrorBoundary}>
      <Settings />
    </SWRErrorBoundary>
  );
};

const PlansErrorBoundary = ({ resetErrorBoundary }: FallbackProps) => {
  const t = useI18n();

  const scroll = (
    <div className={styles.errorTip}>
      <span>{t['com.affine.payment.plans-error-tip']()}</span>
      <a onClick={resetErrorBoundary} className={styles.errorTipRetry}>
        {t['com.affine.payment.plans-error-retry']()}
      </a>
    </div>
  );

  return <PlanLayout cloud={<CloudPlanLayout scroll={scroll} />} />;
};
