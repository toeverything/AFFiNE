import {
  AuthContent,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { NewIcon } from '@blocksuite/icons';
import { useSessionStatus } from '@toeverything/auth/react';
import { type FC, useCallback } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const NoAccess: FC<AuthPanelProps> = ({ setAuthState, onSignedIn }) => {
  const t = useAFFiNEI18N();
  const loginStatus = useSessionStatus();

  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  return (
    <>
      <ModalHeader
        title={t['com.affine.brand.affineCloud']()}
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
