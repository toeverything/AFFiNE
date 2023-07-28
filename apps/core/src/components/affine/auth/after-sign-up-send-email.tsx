import { Button } from '@affine/component';
import {
  AuthContent,
  ModalHeader,
  ResendButton,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon } from '@blocksuite/icons';
import { type FC, useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const AfterSignUpSendEmail: FC<AuthPanelProps> = ({
  currentEmail,
  setAuthState,
}) => {
  const t = useAFFiNEI18N();

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.sign.up.sent.email.subtitle']()}
      />
      <AuthContent style={{ height: 162 }}>
        {t['com.affine.auth.sign.sent.email.message.start']()}
        <a href={`mailto:${currentEmail}`}>{currentEmail}</a>
        {t['com.affine.auth.sign.sent.email.message.end']()}
      </AuthContent>

      <ResendButton onClick={() => {}} />

      <div className={style.authMessage} style={{ marginTop: 20 }}>
        {t['com.affine.auth.sign.auth.code.message']()}
      </div>

      <Button
        type="plain"
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
        withoutHover={true}
        style={{
          marginTop: 8,
          marginLeft: -20,
        }}
        icon={
          <ArrowLeftSmallIcon
            style={{
              color: 'var(--affine-text-secondary-color)',
            }}
          />
        }
      >
        {t['Back']()}
      </Button>
    </>
  );
};
