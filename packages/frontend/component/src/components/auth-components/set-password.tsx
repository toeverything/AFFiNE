import type { PasswordLimitsFragment } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import type { FC } from 'react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '../../ui/button';
import { Wrapper } from '../../ui/layout';
import { PasswordInput } from './password-input';

export const SetPassword: FC<{
  passwordLimits: PasswordLimitsFragment;
  showLater?: boolean;
  onLater?: () => void;
  onSetPassword: (password: string) => void;
}> = ({ passwordLimits, onLater, onSetPassword, showLater = false }) => {
  const t = useI18n();

  const [passwordPass, setPasswordPass] = useState(false);
  const passwordRef = useRef('');

  return (
    <>
      <Wrapper marginTop={30} marginBottom={42}>
        <PasswordInput
          passwordLimits={passwordLimits}
          onPass={useCallback(password => {
            setPasswordPass(true);
            passwordRef.current = password;
          }, [])}
          onPrevent={useCallback(() => {
            setPasswordPass(false);
          }, [])}
        />
      </Wrapper>
      <Button
        variant="primary"
        size="large"
        disabled={!passwordPass}
        style={{ marginRight: 20 }}
        onClick={useCallback(() => {
          onSetPassword(passwordRef.current);
        }, [onSetPassword])}
      >
        {t['com.affine.auth.set.password.save']()}
      </Button>
      {showLater ? (
        <Button variant="plain" size="large" onClick={onLater}>
          {t['com.affine.auth.later']()}
        </Button>
      ) : null}
    </>
  );
};
