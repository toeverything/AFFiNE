import { Button, Wrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type FC, useCallback, useRef, useState } from 'react';

import { PasswordInput } from './password-input';

export const SetPassword: FC<{
  showLater?: boolean;
  onLater: () => void;
  onSetPassword: (password: string) => void;
  confirmButtonContent?: string;
}> = ({ onLater, onSetPassword, showLater = false, confirmButtonContent }) => {
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
        {confirmButtonContent}
      </Button>
      {showLater ? (
        <Button type="plain" size="large" onClick={onLater}>
          {t['com.affine.auth.later']()}
        </Button>
      ) : null}
    </>
  );
};
