import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { passwordStrength } from 'check-password-strength';
import { type FC, useEffect } from 'react';
import { useCallback, useState } from 'react';

import { Input, type InputProps } from '../../../ui/input';
import { ErrorIcon } from './error';
import { SuccessIcon } from './success';
import { Tag } from './tag';

export type Status = 'weak' | 'medium' | 'strong' | 'maximum';

export const PasswordInput: FC<
  InputProps & {
    onPass: (password: string) => void;
    onPrevent: () => void;
  }
> = ({ onPass, onPrevent, ...inputProps }) => {
  const t = useAFFiNEI18N();

  const [status, setStatus] = useState<Status | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<
    'success' | 'error' | null
  >(null);

  const [password, setPassWord] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const onPasswordChange = useCallback((value: string) => {
    setPassWord(value);
    if (!value) {
      return setStatus(null);
    }
    if (value.length > 20) {
      return setStatus('maximum');
    }
    switch (passwordStrength(value).id) {
      case 0:
      case 1:
        setStatus('weak');
        break;
      case 2:
        setStatus('medium');
        break;
      case 3:
        setStatus('strong');
        break;
    }
  }, []);

  const onConfirmPasswordChange = useCallback((value: string) => {
    setConfirmPassword(value);
  }, []);

  useEffect(() => {
    if (password === confirmPassword) {
      setConfirmStatus('success');
    } else {
      setConfirmStatus('error');
    }
  }, [confirmPassword, password]);

  useEffect(() => {
    if (confirmStatus === 'success' && password.length > 7) {
      onPass(password);
    } else {
      onPrevent();
    }
  }, [confirmStatus, onPass, onPrevent, password]);

  return (
    <>
      <Input
        type="password"
        size="extraLarge"
        style={{ marginBottom: 20 }}
        placeholder={t['com.affine.auth.set.password.placeholder']()}
        onChange={onPasswordChange}
        endFix={status ? <Tag status={status} /> : null}
        {...inputProps}
      />
      <Input
        type="password"
        size="extraLarge"
        placeholder={t['com.affine.auth.set.password.placeholder.confirm']()}
        onChange={onConfirmPasswordChange}
        endFix={
          confirmStatus ? (
            confirmStatus === 'success' ? (
              <SuccessIcon />
            ) : (
              <ErrorIcon />
            )
          ) : null
        }
        {...inputProps}
      />
    </>
  );
};
