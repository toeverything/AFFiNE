import { Button, Wrapper } from '@affine/component';
import { AuthInput, ModalHeader } from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon } from '@blocksuite/icons';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';
import { forgetPasswordButton } from './style.css';

export const SignInWithPassword: FC<AuthPanelProps> = ({
  setAuthState,
  currentEmail,
}) => {
  console.log('currentEmail', currentEmail);

  const t = useAFFiNEI18N();

  const [password, setPassword] = useState('');
  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['AFFiNE Cloud']()}
      />

      <Wrapper
        marginTop={30}
        marginBottom={56}
        style={{
          position: 'relative',
        }}
      >
        <AuthInput
          label={t['com.affine.settings.email']()}
          disabled={true}
          value={currentEmail}
        />
        <AuthInput
          label={t['com.affine.auth.password']()}
          value={password}
          type="password"
          onChange={useCallback((value: string) => {
            setPassword(value);
          }, [])}
        />
        <button className={forgetPasswordButton}>
          {t['com.affine.auth.forget']()}
        </button>
      </Wrapper>
      <Button
        type="primary"
        size="large"
        block={true}
        onClick={useCallback(() => {
          console.log('password', password);
        }, [password])}
      >
        {t['com.affine.auth.create.count']()}
      </Button>

      <Button
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
        style={{
          marginTop: 8,
          marginLeft: -16,
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
