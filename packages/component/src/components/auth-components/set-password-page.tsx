import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC, PropsWithChildren, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { Wrapper } from '../../ui/layout';
import { Logo } from './logo';
import { PasswordInput } from './password-input';
import { authPageContainer } from './share.css';

type User = {
  id: string;
  name: string;
  email: string;
  image: string;
};
export const AuthPageContainer: FC<
  PropsWithChildren<{ title?: ReactNode; subtitle?: ReactNode }>
> = ({ children, title, subtitle }) => {
  return (
    <div className={authPageContainer}>
      <Wrapper
        style={{
          position: 'absolute',
          top: 25,
          left: 20,
        }}
      >
        <Logo />
      </Wrapper>
      <div className="wrapper">
        <div className="content">
          <p className="title">{title}</p>
          <p className="subtitle">{subtitle}</p>

          {children}
        </div>
        <Empty />
      </div>
    </div>
  );
};

export const SetPasswordPage: FC<{
  user: User;
  onSetPassword: (password: string) => void;
  onLater: () => void;
}> = ({ user: { email }, onSetPassword, onLater }) => {
  const t = useAFFiNEI18N();
  const [passwordPass, setPasswordPass] = useState(false);
  const passwordRef = useRef('');
  return (
    <AuthPageContainer
      title={t['com.affine.auth.page.sent.email.title']()}
      subtitle={
        <>
          {t['com.affine.auth.page.sent.email.subtitle']()}
          <a href={`mailto:${email}`}>{email}</a>
        </>
      }
    >
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
    </AuthPageContainer>
  );
};
