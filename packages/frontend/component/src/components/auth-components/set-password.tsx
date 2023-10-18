import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { type FC, useCallback, useRef, useState } from 'react';

import { Wrapper } from '../../ui/layout';
import { PasswordInput } from './password-input';

export const SetPassword: FC<{
  showLater?: boolean;
  onLater?: () => void;
  onSetPassword: (password: string) => void;
}> = ({ onLater, onSetPassword, showLater = false }) => {
  const t = useAFFiNEI18N();

  const [passwordPass, setPasswordPass] = useState(false);
  const passwordRef = useRef('');

  return (
    <>
      <Wrapper marginTop={30} marginBottom={42}>
        <PasswordInput
          width={320}
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
        type="primary"
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
        <Button type="plain" size="large" onClick={onLater}>
          {t['com.affine.auth.later']()}
        </Button>
      ) : null}
    </>
  );
};
