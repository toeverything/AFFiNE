import { Button, notify } from '@affine/component';
import {
  AuthContainer,
  AuthContent,
  AuthFooter,
  AuthHeader,
  AuthInput,
} from '@affine/component/auth-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { ServersService } from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import { Trans, useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { SignInState } from '.';
import { Back } from './back';
import * as styles from './style.css';

function normalizeURL(url: string) {
  const normalized = new URL(url).toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export const AddSelfhostedStep = ({
  state,
  changeState,
}: {
  state: SignInState;
  changeState: Dispatch<SetStateAction<SignInState>>;
}) => {
  const t = useI18n();
  const serversService = useService(ServersService);
  const [baseURL, setBaseURL] = useState(state.initialServerBaseUrl ?? '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [errorHint, setErrorHint] = useState(
    t['com.affine.auth.sign.add-selfhosted.error']()
  );

  const urlValid = useMemo(() => {
    try {
      normalizeURL(baseURL);
      return true;
    } catch {
      return false;
    }
  }, [baseURL]);

  const onBaseURLChange = useCallback(
    (value: string) => {
      setBaseURL(value);
      setError(false);
      setErrorHint(t['com.affine.auth.sign.add-selfhosted.error']());
    },
    [t]
  );

  const onConnect = useAsyncCallback(async () => {
    setIsConnecting(true);
    try {
      const server = await serversService.addOrGetServerByBaseUrl(
        normalizeURL(baseURL)
      );
      changeState(prev => ({
        ...prev,
        step: 'signIn',
        server,
      }));
    } catch (err) {
      console.error(err);
      const userFriendlyError = UserFriendlyError.fromAny(err);
      setError(true);
      if (userFriendlyError.is('TOO_MANY_REQUEST')) {
        setErrorHint(t['error.TOO_MANY_REQUEST']());
      } else if (
        userFriendlyError.is('NETWORK_ERROR') ||
        userFriendlyError.is('REQUEST_ABORTED')
      ) {
        setErrorHint(t['error.NETWORK_ERROR']());
      } else {
        setErrorHint(t['com.affine.auth.sign.add-selfhosted.error']());
      }

      notify.error({
        title: t['com.affine.auth.toast.title.failed'](),
        message:
          userFriendlyError.is('REQUEST_ABORTED') ||
          userFriendlyError.is('NETWORK_ERROR')
            ? t['error.NETWORK_ERROR']()
            : userFriendlyError.is('TOO_MANY_REQUEST')
              ? t['error.TOO_MANY_REQUEST']()
              : t[`error.${userFriendlyError.name}`](userFriendlyError.data),
      });
    } finally {
      setIsConnecting(false);
    }
  }, [baseURL, changeState, serversService, t]);

  useEffect(() => {
    if (state.initialServerBaseUrl) {
      changeState(prev => ({
        ...prev,
        initialServerBaseUrl: undefined,
      }));
      if (serversService.getServerByBaseUrl(state.initialServerBaseUrl)) {
        onConnect();
      }
    }
  }, [changeState, onConnect, serversService, state]);

  return (
    <AuthContainer>
      <AuthHeader
        title={t['com.affine.auth.sign.add-selfhosted.title']()}
        subTitle={t['com.affine.auth.sign.add-selfhosted']()}
      />
      <AuthContent>
        <AuthInput
          label={t['com.affine.auth.sign.add-selfhosted.baseurl']()}
          value={baseURL}
          onChange={onBaseURLChange}
          placeholder="https://your-server.com"
          error={!!error}
          disabled={isConnecting}
          errorHint={errorHint}
          onEnter={onConnect}
        />
        <Button
          data-testid="connect-selfhosted-button"
          variant="primary"
          size="extraLarge"
          style={{ width: '100%', marginTop: '16px' }}
          disabled={!urlValid || isConnecting}
          loading={isConnecting}
          onClick={onConnect}
        >
          {t['com.affine.auth.sign.add-selfhosted.connect-button']()}
        </Button>
      </AuthContent>
      <AuthFooter>
        <div className={styles.authMessage}>
          <Trans
            i18nKey="com.affine.auth.sign.add-selfhosted.description"
            components={{
              1: (
                <a
                  href="https://docs.affine.pro/docs/self-host-affine"
                  target="_blank"
                  rel="noreferrer"
                />
              ),
            }}
          />
        </div>
        <Back changeState={changeState} />
      </AuthFooter>
    </AuthContainer>
  );
};
