import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '../../ui/button';
import { Wrapper } from '../../ui/layout';
import { AuthPageContainer } from './auth-page-container';
import { PasswordInput } from './password-input';

type User = {
  id: string;
  name: string;
  email: string;
  image: string;
};

export const SignUpPage: FC<{
  user: User;
  onSetPassword: (password: string) => void;
  onOpenAffine: () => void;
}> = ({ user: { email }, onSetPassword: propsOnSetPassword, onOpenAffine }) => {
  const t = useAFFiNEI18N();
  const [hasSetUp, setHasSetUp] = useState(false);

  const onSetPassword = useCallback(
    (passWord: string) => {
      propsOnSetPassword(passWord);
      setHasSetUp(true);
    },
    [propsOnSetPassword]
  );
  const onLater = useCallback(() => {
    setHasSetUp(true);
  }, []);

  return (
    <AuthPageContainer
      title={
        hasSetUp
          ? t['com.affine.auth.sign.up.success.title']()
          : t['com.affine.auth.page.sent.email.title']()
      }
      subtitle={
        hasSetUp ? (
          t['com.affine.auth.sign.up.success.subtitle']()
        ) : (
          <>
            {t['com.affine.auth.page.sent.email.subtitle']()}
            <a href={`mailto:${email}`}>{email}</a>
          </>
        )
      }
    >
      {hasSetUp ? (
        <Button type="primary" size="large" onClick={onOpenAffine}>
          {t['com.affine.auth.open.affine']()}
        </Button>
      ) : (
        <SetPassword onSetPassword={onSetPassword} onLater={onLater} />
      )}
    </AuthPageContainer>
  );
};

const SetPassword: FC<{
  onLater: () => void;
  onSetPassword: (password: string) => void;
}> = ({ onLater, onSetPassword }) => {
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
        {t['com.affine.auth.create.count']()}
      </Button>
      <Button type="plain" size="large" onClick={onLater}>
        {t['com.affine.auth.later']()}
      </Button>
    </>
  );
};
