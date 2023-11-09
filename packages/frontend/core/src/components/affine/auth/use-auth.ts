import { pushNotificationAtom } from '@affine/component/notification-center';
import type { Notification } from '@affine/component/notification-center/index.jotai';
import { atom, useAtom, useSetAtom } from 'jotai';
import { type SignInResponse } from 'next-auth/react';
import { useCallback } from 'react';

import { signInCloud } from '../../../utils/cloud-utils';
import { useSubscriptionSearch } from './use-subscription';

const COUNT_DOWN_TIME = 60;
export const INTERNAL_BETA_URL = `https://community.affine.pro/c/insider-general/`;

function handleSendEmailError(
  res: SignInResponse | undefined | void,
  pushNotification: (notification: Notification) => void
) {
  if (res?.error) {
    pushNotification({
      title: 'Send email error',
      message: 'Please back to home and try again',
      type: 'error',
    });
  }
}

type AuthStoreAtom = {
  allowSendEmail: boolean;
  resendCountDown: number;
  isMutating: boolean;
};

export const authStoreAtom = atom<AuthStoreAtom>({
  isMutating: false,
  allowSendEmail: true,
  resendCountDown: COUNT_DOWN_TIME,
});

const countDownAtom = atom(
  null, // it's a convention to pass `null` for the first argument
  (get, set) => {
    const clearId = window.setInterval(() => {
      const countDown = get(authStoreAtom).resendCountDown;
      if (countDown === 0) {
        set(authStoreAtom, {
          isMutating: false,
          allowSendEmail: true,
          resendCountDown: COUNT_DOWN_TIME,
        });
        window.clearInterval(clearId);
        return;
      }
      set(authStoreAtom, {
        isMutating: false,
        resendCountDown: countDown - 1,
        allowSendEmail: false,
      });
    }, 1000);
  }
);

export const useAuth = () => {
  const subscriptionData = useSubscriptionSearch();
  const pushNotification = useSetAtom(pushNotificationAtom);
  const [authStore, setAuthStore] = useAtom(authStoreAtom);
  const startResendCountDown = useSetAtom(countDownAtom);

  const signIn = useCallback(
    async (email: string, verifyToken: string, challenge?: string) => {
      setAuthStore(prev => {
        return {
          ...prev,
          isMutating: true,
        };
      });

      const res = await signInCloud(
        'email',
        {
          email: email,
          callbackUrl: subscriptionData
            ? subscriptionData.getRedirectUrl(false)
            : '/auth/signIn',
          redirect: false,
        },
        challenge
          ? {
              challenge,
              token: verifyToken,
            }
          : { token: verifyToken }
      ).catch(console.error);

      handleSendEmailError(res, pushNotification);

      setAuthStore({
        isMutating: false,
        allowSendEmail: false,
        resendCountDown: COUNT_DOWN_TIME,
      });

      startResendCountDown();

      return res;
    },
    [pushNotification, setAuthStore, startResendCountDown, subscriptionData]
  );

  const signUp = useCallback(
    async (email: string, verifyToken: string, challenge?: string) => {
      setAuthStore(prev => {
        return {
          ...prev,
          isMutating: true,
        };
      });

      const res = await signInCloud(
        'email',
        {
          email: email,
          callbackUrl: subscriptionData
            ? subscriptionData.getRedirectUrl(true)
            : '/auth/signUp',
          redirect: false,
        },
        challenge
          ? {
              challenge,
              token: verifyToken,
            }
          : { token: verifyToken }
      ).catch(console.error);

      handleSendEmailError(res, pushNotification);

      setAuthStore({
        isMutating: false,
        allowSendEmail: false,
        resendCountDown: COUNT_DOWN_TIME,
      });

      startResendCountDown();

      return res;
    },
    [pushNotification, setAuthStore, startResendCountDown, subscriptionData]
  );

  const signInWithGoogle = useCallback(() => {
    signInCloud('google').catch(console.error);
  }, []);

  return {
    allowSendEmail: authStore.allowSendEmail,
    resendCountDown: authStore.resendCountDown,
    isMutating: authStore.isMutating,
    signUp,
    signIn,
    signInWithGoogle,
  };
};
