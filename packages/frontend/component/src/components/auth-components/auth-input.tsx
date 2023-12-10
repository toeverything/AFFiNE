import clsx from 'clsx';
import type { FC, HTMLAttributes } from 'react';

import { Input, type InputProps } from '../../ui/input';
import * as styles from './share.css';
export type AuthInputProps = InputProps & {
  label?: string;
  error?: boolean;
  errorHint?: string;
  withoutHint?: boolean;
  onEnter?: () => void;
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
};
export const AuthInput: FC<AuthInputProps> = ({
  label,
  error,
  errorHint,
  withoutHint = false,
  onEnter,
  wrapperProps: { className, ...otherWrapperProps } = {},
  ...inputProps
}) => {
  return (
    <div
      className={clsx(styles.authInputWrapper, className, {
        'without-hint': withoutHint,
      })}
      {...otherWrapperProps}
    >
      {label ? <label>{label}</label> : null}
      <Input
        className={styles.input}
        size="extraLarge"
        status={error ? 'error' : 'default'}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onEnter?.();
          }
        }}
        {...inputProps}
      />
      {error && errorHint && !withoutHint ? (
        <div
          className={clsx(styles.formHint, {
            error: error,
          })}
        >
          {errorHint}
        </div>
      ) : null}
    </div>
  );
};
