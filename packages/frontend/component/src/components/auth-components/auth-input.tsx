import clsx from 'clsx';
import type { ReactNode } from 'react';

import type { InputProps } from '../../ui/input';
import { Input } from '../../ui/input';
import * as styles from './share.css';
export type AuthInputProps = InputProps & {
  label?: string;
  error?: boolean;
  errorHint?: ReactNode;
  onEnter?: () => void;
};
export const AuthInput = ({
  label,
  error,
  errorHint,
  onEnter,
  className,
  ...inputProps
}: AuthInputProps) => {
  return (
    <div
      className={clsx(styles.authInputWrapper, {
        'with-hint': !!errorHint,
      })}
    >
      {label ? <label>{label}</label> : null}
      <Input
        className={clsx(className)}
        size="extraLarge"
        status={error ? 'error' : 'default'}
        onEnter={onEnter}
        {...inputProps}
      />
      <div
        className={styles.authInputError}
        style={{ visibility: error ? 'visible' : 'hidden' }}
      >
        {errorHint}
      </div>
    </div>
  );
};
