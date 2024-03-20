import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { passwordStrength } from 'check-password-strength';
import { type FC, useEffect } from 'react';
import { useCallback, useState } from 'react';

import { Input, type InputProps } from '../../../ui/input';
import * as styles from '../share.css';
import { ErrorIcon } from './error';
import { statusWrapper } from './style.css';
import { SuccessIcon } from './success';
import { Tag } from './tag';

export type Status = 'weak' | 'medium' | 'strong' | 'minimum' | 'maximum';

const MIN_LENGTH = 8;
const MAX_LENGTH = 20;

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
    value = value.trim();
    setPassWord(value);
    if (!value) {
      return setStatus(null);
    }
    if (value.length < MIN_LENGTH) {
      return setStatus('minimum');
    }
    if (value.length > MAX_LENGTH) {
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
    setConfirmPassword(value.trim());
  }, []);

  useEffect(() => {
    if (!password || !confirmPassword) {
      return;
    }
    if (password === confirmPassword) {
      setConfirmStatus('success');
    } else {
      setConfirmStatus('error');
    }
  }, [confirmPassword, password]);

  useEffect(() => {
    if (
      confirmStatus === 'success' &&
      password.length >= MIN_LENGTH &&
      password.length <= MAX_LENGTH
    ) {
      onPass(password);
    } else {
      onPrevent();
    }
  }, [confirmStatus, onPass, onPrevent, password]);

  return (
    <>
      <Input
        className={styles.input}
        type="password"
        size="extraLarge"
        minLength={MIN_LENGTH}
        maxLength={MAX_LENGTH}
        style={{ marginBottom: 20 }}
        placeholder={t['com.affine.auth.set.password.placeholder']()}
        onChange={onPasswordChange}
        endFix={
          <div className={statusWrapper}>
            {status ? <Tag status={status} /> : null}
          </div>
        }
        {...inputProps}
      />
      <Input
        className={styles.input}
        type="password"
        size="extraLarge"
        minLength={MIN_LENGTH}
        maxLength={MAX_LENGTH}
        placeholder={t['com.affine.auth.set.password.placeholder.confirm']()}
        onChange={onConfirmPasswordChange}
        endFix={
          <div className={statusWrapper}>
            {confirmStatus ? (
              confirmStatus === 'success' ? (
                <SuccessIcon />
              ) : (
                <ErrorIcon />
              )
            ) : null}
          </div>
        }
        {...inputProps}
      />
    </>
  );
};
