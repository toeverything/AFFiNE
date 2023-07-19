import { Button, Wrapper } from '@affine/component';
import {
  AuthContent,
  ModalHeader,
  PasswordInput,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';

export const SetPassword: FC<AuthPanelProps> = ({ currentEmail }) => {
  const t = useAFFiNEI18N();

  const [passwordPass, setPasswordPass] = useState(false);
  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.set.password']()}
      />
      <AuthContent>
        {t['com.affine.auth.set.password.message']()}
        <a href={`mailto:${currentEmail}`}>{currentEmail}</a>
      </AuthContent>

      <Wrapper marginTop={30} marginBottom={42}>
        <PasswordInput
          onPass={useCallback(password => {
            console.log('password', password);

            setPasswordPass(true);
          }, [])}
          onPrevent={useCallback(() => {
            setPasswordPass(false);
          }, [])}
        />
      </Wrapper>
      <Button
        type="primary"
        size="middle"
        style={{ width: '100%' }}
        disabled={!passwordPass}
      >
        {t['com.affine.auth.create.count']()}
      </Button>
    </>
  );
};
