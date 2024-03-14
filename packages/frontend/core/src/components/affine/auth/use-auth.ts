import { pushNotificationAtom } from '@affine/component/notification-center';
import type { Notification } from '@affine/component/notification-center/index.jotai';
import type { OAuthProviderType } from '@affine/graphql';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { signInCloud } from '../../../utils/cloud-utils';
import { useSubscriptionSearch } from './use-subscription';

const COUNT_DOWN_TIME = 60;
export const INTERNAL_BETA_URL = `https://community.affine.pro/c/insider-general/`;

function handleSendEmailError(
  res: Response | undefined | void,
  pushNotification: (notification: Notification) => void
) {
  if (!res?.ok) {
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

  const sendEmailMagicLink = useCallback(
    async (
      signUp: boolean,
      email: string,
      verifyToken: string,
      challenge?: string
    ) => {
      setAuthStore(prev => {
        return {
          ...prev,
          isMutating: true,
        };
      });

      const res = await signInCloud(
        'email',
        {
          email,
        },
        {
          ...(challenge
            ? {
                challenge,
                token: verifyToken,
              }
            : { token: verifyToken }),
          callbackUrl: subscriptionData
            ? subscriptionData.getRedirectUrl(signUp)
            : '/auth/signIn',
        }
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
      return sendEmailMagicLink(true, email, verifyToken, challenge).catch(
        console.error
      );
    },
    [sendEmailMagicLink]
  );

  const signIn = useCallback(
    async (email: string, verifyToken: string, challenge?: string) => {
      return sendEmailMagicLink(false, email, verifyToken, challenge).catch(
        console.error
      );
    },
    [sendEmailMagicLink]
  );

  const oauthSignIn = useCallback((provider: OAuthProviderType) => {
    signInCloud(provider).catch(console.error);
  }, []);

  const resetCountDown = useCallback(() => {
    setAuthStore({
      isMutating: false,
      allowSendEmail: false,
      resendCountDown: 0,
    });
  }, [setAuthStore]);

  return {
    allowSendEmail: authStore.allowSendEmail,
    resendCountDown: authStore.resendCountDown,
    resetCountDown,
    isMutating: authStore.isMutating,
    signUp,
    signIn,
    oauthSignIn,
  };
};
