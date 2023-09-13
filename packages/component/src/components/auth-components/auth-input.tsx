import clsx from 'clsx';
import type { FC, HTMLAttributes } from 'react';

import { Input, type InputProps } from '../../ui/input';
import { authInputWrapper, formHint } from './share.css';
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
      className={clsx(authInputWrapper, className, {
        'without-hint': withoutHint,
      })}
      {...otherWrapperProps}
    >
      {label ? <label>{label}</label> : null}
      <Input
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
          className={clsx(formHint, {
            error: error,
          })}
        >
          {errorHint}
        </div>
      ) : null}
    </div>
  );
};
