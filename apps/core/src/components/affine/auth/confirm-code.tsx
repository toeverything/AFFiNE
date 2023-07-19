import { Button } from '@affine/component';
import {
  AuthCode,
  AuthContent,
  ModalHeader,
  ResendButton,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon } from '@blocksuite/icons';
import { type FC, useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const ConfirmCode: FC<AuthPanelProps> = ({
  currentEmail,
  setAuthState,
}) => {
  const t = useAFFiNEI18N();
  const [isErrorCode, setIsErrorCode] = useState(false);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.email.confirm']()}
      />
      <AuthContent>
        {t['com.affine.auth.sign.confirm.message']()}
        <a href={`mailto:${currentEmail}`}>{currentEmail}</a>
      </AuthContent>
      <AuthCode
        style={{ marginTop: '30px' }}
        error={isErrorCode}
        onComplete={useCallback(
          (code: string) => {
            if (code === '123123') {
              setAuthState('setPassword');
            }
            setIsErrorCode(code !== '123123');
          },
          [setAuthState]
        )}
      />

      <ResendButton onClick={() => {}} />

      <div className={style.authMessage} style={{ marginTop: 20 }}>
        {t['com.affine.auth.sign.auth.code.message']()}
      </div>

      <Button
        size="small"
        bold={true}
        noBorder={true}
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
        style={{
          color: 'var(--affine-text-secondary-color)',
          marginTop: 8,
          marginLeft: -16,
        }}
        hoverColor={'var(--affine-text-secondary-color)'}
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
