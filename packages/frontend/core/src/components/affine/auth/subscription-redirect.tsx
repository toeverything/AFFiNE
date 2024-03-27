import { SignUpPage } from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { Loading } from '@affine/component/ui/loading';
import { AffineShapeIcon } from '@affine/core/components/page-list';
import { useCredentialsRequirement } from '@affine/core/hooks/affine/use-server-config';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import type { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import {
  changePasswordMutation,
  createCheckoutSessionMutation,
  subscriptionQuery,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { nanoid } from 'nanoid';
import { Suspense, useCallback, useEffect, useMemo } from 'react';

import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { useMutation } from '../../../hooks/use-mutation';
import {
  RouteLogic,
  useNavigateHelper,
} from '../../../hooks/use-navigate-helper';
import { useQuery } from '../../../hooks/use-query';
import * as styles from './subscription-redirect.css';
import { useSubscriptionSearch } from './use-subscription';

const usePaymentRedirect = () => {
  const searchData = useSubscriptionSearch();
  if (!searchData?.recurring) {
    throw new Error('Invalid recurring data.');
  }

  const recurring = searchData.recurring as SubscriptionRecurring;
  const plan = searchData.plan as SubscriptionPlan;
  const coupon = searchData.coupon;
  const idempotencyKey = useMemo(() => nanoid(), []);
  const { trigger: checkoutSubscription } = useMutation({
    mutation: createCheckoutSessionMutation,
  });

  return useAsyncCallback(async () => {
    const { createCheckoutSession: checkoutUrl } = await checkoutSubscription({
      input: {
        recurring,
        plan,
        coupon,
        idempotencyKey,
        successCallbackLink: null,
      },
    });
    window.open(checkoutUrl, '_self', 'norefferer');
  }, [recurring, plan, coupon, idempotencyKey, checkoutSubscription]);
};

const CenterLoading = () => {
  return (
    <div className={styles.loadingContainer}>
      <Loading size={40} />
    </div>
  );
};

const SubscriptionExisting = () => {
  const t = useAFFiNEI18N();
  const { jumpToIndex } = useNavigateHelper();

  const onButtonClick = useCallback(() => {
    jumpToIndex(RouteLogic.REPLACE);
  }, [jumpToIndex]);

  return (
    <div className={styles.subscriptionLayout}>
      <div className={styles.subscriptionBox}>
        <AffineShapeIcon width={180} height={180} />
        <p className={styles.subscriptionTips}>
          {t['com.affine.payment.subscription.exist']()}
        </p>
        <Button
          data-testid="upgrade-workspace-button"
          onClick={onButtonClick}
          size="extraLarge"
          type="primary"
        >
          {t['com.affine.auth.open.affine']()}
        </Button>
      </div>
    </div>
  );
};

const SubscriptionRedirection = ({ redirect }: { redirect: () => void }) => {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      redirect();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [redirect]);

  return <CenterLoading />;
};

const SubscriptionRedirectWithData = () => {
  const t = useAFFiNEI18N();
  const user = useCurrentUser();
  const searchData = useSubscriptionSearch();
  const openPaymentUrl = usePaymentRedirect();
  const { password: passwordLimits } = useCredentialsRequirement();

  const { trigger: changePassword } = useMutation({
    mutation: changePasswordMutation,
  });
  const { data: subscriptionData } = useQuery({
    query: subscriptionQuery,
  });

  const onSetPassword = useCallback(
    async (password: string) => {
      await changePassword({
        token: searchData?.passwordToken ?? '',
        newPassword: password,
      });
    },
    [changePassword, searchData]
  );

  if (searchData?.withSignUp) {
    return (
      <SignUpPage
        user={user}
        passwordLimits={passwordLimits}
        onSetPassword={onSetPassword}
        onOpenAffine={openPaymentUrl}
        openButtonText={t['com.affine.payment.subscription.go-to-subscribe']()}
      />
    );
  }

  if (subscriptionData.currentUser?.subscription) {
    return <SubscriptionExisting />;
  }

  return <SubscriptionRedirection redirect={openPaymentUrl} />;
};

export const SubscriptionRedirect = () => {
  return (
    <Suspense fallback={<CenterLoading />}>
      <SubscriptionRedirectWithData />
    </Suspense>
  );
};
