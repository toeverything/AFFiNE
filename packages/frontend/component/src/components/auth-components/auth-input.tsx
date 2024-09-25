import clsx from 'clsx';

import type { InputProps } from '../../ui/input';
import { Input } from '../../ui/input';
import * as styles from './share.css';
export type AuthInputProps = InputProps & {
  label?: string;
  error?: boolean;
  errorHint?: string;
  withoutHint?: boolean;
  onEnter?: () => void;
};
export const AuthInput = ({
  label,
  error,
  errorHint,
  withoutHint = false,
  onEnter,
  className,
  ...inputProps
}: AuthInputProps) => {
  return (
    <div
      className={clsx(styles.authInputWrapper, {
        'without-hint': withoutHint,
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
