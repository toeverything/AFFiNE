import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import { Button } from '../../ui/button';
import { AuthInput } from './auth-input';
import { AuthPageContainer } from './auth-page-container';
type User = {
  id: string;
  name: string;
  email: string;
  image: string;
};
function validateEmail(email: string) {
  return new RegExp(
    /^(?:(?:[^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(?:(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|((?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  ).test(email);
}

export const ChangeEmailPage: FC<{
  user: User;
  onChangeEmail: (email: string) => Promise<boolean>;
  onOpenAffine: () => void;
}> = ({ onChangeEmail: propsOnChangeEmail, onOpenAffine }) => {
  const t = useAFFiNEI18N();
  const [hasSetUp, setHasSetUp] = useState(false);
  const [email, setEmail] = useState('');
  const [isValidEmail, setIsValidEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const onContinue = useCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }
    setIsValidEmail(true);
    setLoading(true);

    const setup = await propsOnChangeEmail(email);

    setLoading(false);
    setHasSetUp(setup);
  }, [email, propsOnChangeEmail]);
  const onEmailChange = useCallback((value: string) => {
    setEmail(value);
  }, []);
  return (
    <AuthPageContainer
      title={
        hasSetUp
          ? t['com.affine.auth.change.email.page.success.title']()
          : t['com.affine.auth.change.email.page.title']()
      }
      subtitle={
        hasSetUp
          ? t['com.affine.auth.change.email.page.success.subtitle']()
          : t['com.affine.auth.change.email.page.subtitle']()
      }
    >
      {hasSetUp ? (
        <Button type="primary" size="large" onClick={onOpenAffine}>
          {t['com.affine.auth.open.affine']()}
        </Button>
      ) : (
        <>
          <AuthInput
            width={320}
            label={t['com.affine.settings.email']()}
            placeholder={t['com.affine.auth.sign.email.placeholder']()}
            value={email}
            onChange={onEmailChange}
            error={!isValidEmail}
            errorHint={
              isValidEmail ? '' : t['com.affine.auth.sign.email.error']()
            }
            onEnter={onContinue}
          />
          <Button
            type="primary"
            size="large"
            onClick={onContinue}
            loading={loading}
          >
            {t['com.affine.auth.set.email.save']()}
          </Button>
        </>
      )}
    </AuthPageContainer>
  );
};
