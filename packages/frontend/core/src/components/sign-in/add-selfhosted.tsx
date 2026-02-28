import { Button } from '@affine/component';
import {
  AuthContainer,
  AuthContent,
  AuthFooter,
  AuthHeader,
  AuthInput,
} from '@affine/component/auth-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { ServersService } from '@affine/core/modules/cloud';
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
  const serversService = useService(ServersService);
  const [baseURL, setBaseURL] = useState(state.initialServerBaseUrl ?? '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<boolean>(false);

  const t = useI18n();

  const urlValid = useMemo(() => {
    try {
      normalizeURL(baseURL);
      return true;
    } catch {
      return false;
    }
  }, [baseURL]);

  const onBaseURLChange = useCallback((value: string) => {
    setBaseURL(value);
    setError(false);
  }, []);

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
      setError(true);
    }

    setIsConnecting(false);
  }, [baseURL, changeState, serversService]);

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
          errorHint={t['com.affine.auth.sign.add-selfhosted.error']()}
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
