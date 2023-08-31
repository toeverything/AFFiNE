import { pushNotificationAtom } from '@affine/component/notification-center';
import type { Notification } from '@affine/component/notification-center/index.jotai';
import { isDesktop } from '@affine/env/constant';
import { atom, useAtom, useSetAtom } from 'jotai';
import { type SignInResponse } from 'next-auth/react';
import { useCallback } from 'react';

import { signInCloud } from '../../../utils/cloud-utils';
import { buildCallbackUrl } from './callback-url';

const COUNT_DOWN_TIME = 60;
const INTERNAL_BETA_URL = `https://community.affine.pro/c/insider-general/`;

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
  // if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
  //   pushNotification({
  //     title: 'Sign up error',
  //     message: `You don't have early access permission\nVisit ${INTERNAL_BETA_URL} for more information`,
  //     type: 'error',
  //   });
  // }
}

type AuthStoreAtom = {
  allowSendEmail: boolean;
  resendCountDown: number;
};

export const authStoreAtom = atom<AuthStoreAtom>({
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
          allowSendEmail: true,
          resendCountDown: COUNT_DOWN_TIME,
        });
        window.clearInterval(clearId);
        return;
      }
      set(authStoreAtom, {
        resendCountDown: countDown - 1,
        allowSendEmail: false,
      });
    }, 1000);
  }
);

export const useAuth = ({ onNoAccess }: { onNoAccess: () => void }) => {
  const pushNotification = useSetAtom(pushNotificationAtom);
  const [authStore, setAuthStore] = useAtom(authStoreAtom);
  const startResendCountDown = useSetAtom(countDownAtom);

  const signIn = useCallback(
    async (email: string) => {
      setAuthStore(() => ({
        allowSendEmail: false,
        resendCountDown: COUNT_DOWN_TIME,
      }));
      startResendCountDown();

      const res = await signInCloud('email', {
        email: email,
        callbackUrl: buildCallbackUrl('signIn'),
        redirect: false,
      }).catch(console.error);

      handleSendEmailError(res, pushNotification);

      if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
        onNoAccess();
      }
    },
    [onNoAccess, pushNotification, setAuthStore, startResendCountDown]
  );

  const signUp = useCallback(
    async (email: string) => {
      setAuthStore({
        allowSendEmail: false,
        resendCountDown: COUNT_DOWN_TIME,
      });
      startResendCountDown();

      const res = await signInCloud('email', {
        email: email,
        callbackUrl: buildCallbackUrl('signUp'),
        redirect: false,
      }).catch(console.error);

      handleSendEmailError(res, pushNotification);

      if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
        onNoAccess();
      }
    },
    [onNoAccess, pushNotification, setAuthStore, startResendCountDown]
  );

  const signInWithGoogle = useCallback(() => {
    if (isDesktop) {
      open(
        `/desktop-signin?provider=google&callback_url=${buildCallbackUrl(
          '/open-app/oauth-jwt'
        )}`,
        '_target'
      );
    } else {
      signInCloud('google').catch(console.error);
    }
  }, []);

  return {
    allowSendEmail: authStore.allowSendEmail,
    resendCountDown: authStore.resendCountDown,
    signUp,
    signIn,
    signInWithGoogle,
  };
};
