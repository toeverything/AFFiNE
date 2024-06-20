import { type PasswordLimitsFragment } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { type Options, passwordStrength } from 'check-password-strength';
import { type FC, useEffect, useMemo } from 'react';
import { useCallback, useState } from 'react';
import { z, type ZodCustomIssue, ZodIssueCode } from 'zod';

import type { InputProps } from '../../../ui/input';
import { Input } from '../../../ui/input';
import * as styles from '../share.css';
import { ErrorIcon } from './error';
import { statusWrapper } from './style.css';
import { SuccessIcon } from './success';
import { Tag } from './tag';

export type Status = 'weak' | 'medium' | 'strong' | 'minimum' | 'maximum';

const PASSWORD_STRENGTH_OPTIONS: Options<string> = [
  {
    id: 0,
    value: 'weak',
    minDiversity: 0,
    minLength: 0,
  },
  {
    id: 1,
    value: 'medium',
    minDiversity: 4,
    minLength: 8,
  },
  {
    id: 2,
    value: 'strong',
    minDiversity: 4,
    minLength: 10,
  },
];

export const PasswordInput: FC<
  InputProps & {
    passwordLimits: PasswordLimitsFragment;
    onPass: (password: string) => void;
    onPrevent: () => void;
  }
> = ({ passwordLimits, onPass, onPrevent, ...inputProps }) => {
  const t = useI18n();

  const [status, setStatus] = useState<Status | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<
    'success' | 'error' | null
  >(null);
  const [canSubmit, setCanSubmit] = useState(false);

  const [password, setPassWord] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const validationSchema = useMemo(() => {
    const { minLength, maxLength } = passwordLimits;
    return z.string().superRefine((val, ctx) => {
      if (val.length < minLength) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          params: {
            status: 'minimum',
          },
        });
      } else if (val.length > maxLength) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          params: {
            status: 'maximum',
          },
        });
      }
      // https://github.com/deanilvincent/check-password-strength?tab=readme-ov-file#default-options
      const { value: status } = passwordStrength(
        val,
        PASSWORD_STRENGTH_OPTIONS
      );

      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: 'password strength',
        path: ['strength'],
        params: {
          status,
        },
      });
    });
  }, [passwordLimits]);

  const validatePasswords = useCallback(
    (password: string, confirmPassword: string) => {
      const result = validationSchema.safeParse(password);
      let canSubmit = false;
      if (!result.success) {
        const issues = result.error.issues as ZodCustomIssue[];
        const firstIssue = issues[0];
        setStatus(firstIssue.params?.status || null);
        // ignore strength error
        if (firstIssue.path.includes('strength')) {
          canSubmit = true;
        }
      }
      if (confirmPassword) {
        const isEqual = password === confirmPassword;
        if (isEqual) {
          setConfirmStatus('success');
        } else {
          setConfirmStatus('error');
        }
        canSubmit &&= isEqual;
      } else {
        canSubmit &&= false;
        setConfirmStatus(null);
      }
      setCanSubmit(canSubmit);
    },
    [validationSchema]
  );

  const onPasswordChange = useCallback(
    (value: string) => {
      const password = value.trim();
      setPassWord(password);
      validatePasswords(password, confirmPassword);
    },
    [validatePasswords, confirmPassword]
  );

  const onConfirmPasswordChange = useCallback(
    (value: string) => {
      const confirmPassword = value.trim();
      setConfirmPassword(confirmPassword);
      validatePasswords(password, confirmPassword);
    },
    [validatePasswords, password]
  );

  useEffect(() => {
    if (canSubmit) {
      onPass(password);
    } else {
      onPrevent();
    }
  }, [canSubmit, password, onPass, onPrevent]);

  return (
    <>
      <Input
        name="password"
        className={styles.input}
        type="password"
        size="extraLarge"
        style={{ marginBottom: 20 }}
        placeholder={t['com.affine.auth.set.password.placeholder']({
          min: String(passwordLimits.minLength),
        })}
        onChange={onPasswordChange}
        endFix={
          <div className={statusWrapper}>
            {status ? (
              <Tag
                status={status}
                minimum={t['com.affine.auth.set.password.message.minlength']({
                  min: String(passwordLimits.minLength),
                })}
                maximum={t['com.affine.auth.set.password.message.maxlength']({
                  max: String(passwordLimits.maxLength),
                })}
              />
            ) : null}
          </div>
        }
        {...inputProps}
      />
      <Input
        name="confirmPassword"
        className={styles.input}
        type="password"
        size="extraLarge"
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
