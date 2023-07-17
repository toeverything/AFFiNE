import clsx from 'clsx';
import type { FC } from 'react';

import { Input, type InputProps } from '../../ui/input';
import { authInputWrapper, formHint } from './share.css';
export type AuthInputProps = InputProps & {
  label?: string;
  error?: boolean;
  errorHint?: string;
  withoutHint?: boolean;
};
export const AuthInput: FC<AuthInputProps> = ({
  label,
  error,
  errorHint,
  withoutHint = false,
  ...inputProps
}) => {
  return (
    <div
      className={clsx(authInputWrapper, {
        'without-hint': withoutHint,
      })}
    >
      {label ? <label>{label}</label> : null}
      <Input {...inputProps} />
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
