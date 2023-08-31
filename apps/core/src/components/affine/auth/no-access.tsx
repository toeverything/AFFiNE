import {
  AuthContent,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { NewIcon } from '@blocksuite/icons';
import { type FC, useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const NoAccess: FC<AuthPanelProps> = ({ setAuthState, onSignedIn }) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();

  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  return (
    <>
      <ModalHeader
        title={t['AFFiNE Cloud']()}
        subTitle={t['Early Access Stage']()}
      />
      <AuthContent style={{ height: 162 }}>
        {t['com.affine.auth.sign.no.access.hint']()}
        <a href="https://community.affine.pro/c/insider-general/">
          {t['com.affine.auth.sign.no.access.link']()}
        </a>
      </AuthContent>

      <div className={style.accessMessage}>
        <NewIcon
          style={{
            fontSize: 16,
            marginRight: 4,
            color: 'var(--affine-icon-color)',
          }}
        />
        {t['com.affine.auth.sign.no.access.wait']()}
      </div>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
